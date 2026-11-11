import { setCryptoImplementation } from "@reclaimprotocol/tls";
import { webcryptoCrypto } from "@reclaimprotocol/tls/webcrypto";
setCryptoImplementation(webcryptoCrypto);

import { createClaimOnAttestor } from "@reclaimprotocol/attestor-core";
import { HttpMethod, LogType } from "./types";
import { BuilderClientOptions, Options, secretOptions, SignatureData } from "./interfaces";
import {
  assertCorrectnessOfOptions,
  validateURL,
  sendLogs,
  validateApplicationIdAndSecret,
  transformProof,
  transformTeeProof,
  getAttestorUrl,
  getTeeUrls,
  isUrlAllowed,
  getOrCreateOwnerKey,
  isTransientTeeError,
  TEE_MIN_ATTEMPTS,
  createEphemeralOwnerKey,
  encodeBuilderAuthorizationForTee,
  getHostFromUrl,
  requestBuilderAuthorization,
  decodeBuilderAuthorizationToken,
} from "./utils";
import { v4 } from "uuid";
import P from "pino";
import { verifySessionSignature } from "./signature";
import { BuilderAuthorizationError, InvalidParamError } from "./errors";
import { ReclaimSDK } from "./tee";
import { ensureTeeLibrary, isTeePlatformSupported } from "./tee-library";
import { resolveUseTee, teeRedactions } from "./tee-default";
import { ATTESTOR_NODE_URL, BUILDER_BASE_URL } from "./constants";
const logger = P();

export class ReclaimClient {
  applicationId: string;
  applicationSecret?: string;
  signatureData?: SignatureData;
  ownerKey?: string;
  logs?: boolean;
  private teeSDK?: ReclaimSDK;
  sessionId: string;
  retries: number;
  /** Builder org token (`rorg_...`), set only when constructed in Builder mode. */
  private builderOrgToken?: string;
  private builderBaseUrl?: string;
  /** Ephemeral, per-client wallet used as `ownerPrivateKey` for claims made in Builder mode. */
  private builderOwnerKey?: string;

  /**
   * Creates a new ReclaimClient instance, authenticated with a legacy
   * application id/secret or signature.
   * @param applicationId - Your Reclaim application ID
   * @param applicationSecret - Either application secret (0x...) or signature (ey...)
   * @param logs - Enable logging (optional, default: false)
   * @param retries - Default attempts per zkFetch call (optional, default: 1)
   */
  constructor(
    applicationId: string,
    applicationSecret: string,
    logs?: boolean,
    retries?: number
  );
  /**
   * Creates a new ReclaimClient instance in Builder mode: instead of an
   * application secret, the client holds a Builder organization token and
   * asks Builder to authorize each zkFetch call, drawing down the org's
   * `ZKFETCH` quota pool.
   */
  constructor(builderOptions: BuilderClientOptions);
  constructor(
    applicationId: string | BuilderClientOptions,
    applicationSecret?: string,
    logs?: boolean,
    retries: number = 1
  ) {
    if (typeof applicationId === 'object' && applicationId !== null) {
      const {
        orgToken,
        builderBaseUrl,
        logs: builderLogs,
        retries: builderRetries = 1,
      } = applicationId;

      if (!orgToken || typeof orgToken !== 'string') {
        throw new InvalidParamError('orgToken must be a non-empty string');
      }

      if (!Number.isInteger(builderRetries) || builderRetries < 1) {
        throw new InvalidParamError('retries must be a positive integer');
      }

      // Builder mode has no legacy application id -- nothing in this codebase
      // resolves one, and none of the Builder wire contract needs it.
      this.applicationId = '';
      this.sessionId = v4().toString();
      this.logs = builderLogs;
      this.retries = builderRetries;
      this.builderOrgToken = orgToken;
      this.builderBaseUrl = builderBaseUrl || BUILDER_BASE_URL;
      this.builderOwnerKey = createEphemeralOwnerKey();

      logger.level = builderLogs ? "info" : "silent";
      logger.info(
        `Initializing Builder-mode client with sessionId: ${this.sessionId}`
      );
      return;
    }

    // ---- Legacy applicationId/applicationSecret (or signature) path.  ----
    // Unchanged from before Builder mode was added.
    // Validate applicationId
    if (!applicationId || typeof applicationId !== 'string') {
      throw new InvalidParamError('applicationId must be a non-empty string');
    }

    // Validate applicationSecret
    if (!applicationSecret || typeof applicationSecret !== 'string') {
      throw new InvalidParamError('applicationSecret must be a non-empty string');
    }

    if (!Number.isInteger(retries) || retries < 1) {
      throw new InvalidParamError('retries must be a positive integer');
    }

    this.applicationId = applicationId;
    this.sessionId = v4().toString();
    this.logs = logs;
    this.retries = retries;

    // Set up logger
    logger.level = logs ? "info" : "silent";

    // Auto-detect authentication method based on format and length
    if (applicationSecret.startsWith('0x')) {
      if (applicationSecret.length !== 66) {
        throw new InvalidParamError('Invalid application secret: must be 66 characters (0x + 64 hex digits)');
      }

      validateApplicationIdAndSecret(applicationId, applicationSecret);
      this.applicationSecret = applicationSecret;

      logger.info(
        `Initializing client with applicationId: ${this.applicationId} and sessionId: ${this.sessionId}`
      );
    } else if (applicationSecret.startsWith('ey') && applicationSecret.includes('.') && applicationSecret.includes('0x')) {
      const parts = applicationSecret.split('.');
      if (parts.length !== 2) {
        throw new InvalidParamError('Invalid signature');
      }

      this.signatureData = verifySessionSignature(applicationSecret);

      if (this.signatureData.applicationId.toLowerCase() !== applicationId.toLowerCase()) {
        throw new InvalidParamError('Signature applicationId does not match provided applicationId');
      }

      this.ownerKey = getOrCreateOwnerKey(this.applicationId);

      logger.info(
        `Initializing client with applicationId: ${this.applicationId} and sessionId: ${this.sessionId}`
      );
    } else {
      throw new InvalidParamError(
        'Invalid application secret'
      );
    }
  }

  async zkFetch(
    url: string,
    options?: Options,
    secretOptions?: secretOptions,
    retries = this.retries,
    retryInterval = 1000
  ) {
    validateURL(url, "zkFetch");
    // Checked before either path runs, so a bad value never reaches Builder
    // (which would issue, and charge for, an authorization).
    if (!Number.isInteger(retries) || retries < 1) {
      throw new InvalidParamError('retries must be a positive integer');
    }
    if (options !== undefined) {
      assertCorrectnessOfOptions(options);
    }

    // If using signature mode, verify URL is allowed
    if (this.signatureData) {
      if (!isUrlAllowed(url, this.signatureData.allowedUrls)) {
        throw new InvalidParamError(
          `URL "${url}" is not allowed by the signature. Allowed patterns: ${this.signatureData.allowedUrls.join(', ')}`
        );
      }
    }

    // Determine which private key to use
    let privateKey: string;
    if (this.builderOrgToken) {
      // Builder mode: the org token authenticates to Builder, not the
      // attestor, and it isn't an ethers-compatible signing key -- so this
      // client's own ephemeral wallet owns any claim it creates.
      privateKey = this.builderOwnerKey!;
    } else if (this.applicationSecret) {
      privateKey = this.applicationSecret;
    } else if (this.ownerKey) {
      // Use the client-generated owner key
      privateKey = this.ownerKey;
    } else {
      throw new InvalidParamError('No authentication method available');
    }

    // Generate a fresh session id for THIS verification. Reusing the client
    // instance must not reuse the session id across proofs.
    const sessionId = v4().toString();

    // The legacy telemetry endpoint resolves `applicationId` against the old
    // devtools backend; Builder-mode clients have no such id and aren't
    // registered there, so skip it rather than fail every call on a
    // best-effort log write.
    if (!this.builderOrgToken) {
      await sendLogs({
        sessionId,
        logType: LogType.VERIFICATION_STARTED,
        applicationId: this.applicationId,
      });
    }

    // TEE is the default; see resolveUseTee for when a call stays on the non-TEE path.
    if (resolveUseTee(options, secretOptions, isTeePlatformSupported())) {
      // Lazy-initialize TEE SDK if not already initialized. The native library
      // is normally downloaded at install time; this downloads and verifies it
      // if that was skipped.
      if (!this.teeSDK) {
        const libraryPath = await ensureTeeLibrary();
        this.teeSDK = new ReclaimSDK(libraryPath);
        this.teeSDK.init();
      }
      return await this.zkFetchWithTee(url, sessionId, options, secretOptions, retries, retryInterval);
    }

    // Builder uses the known attestor endpoint. Legacy clients continue to
    // resolve their endpoint from the old feature-flag API.
    const attestorUrl = this.builderOrgToken ? ATTESTOR_NODE_URL : await getAttestorUrl();

    let attempt = 0;
    while (attempt < retries) {
      try {
        // In Builder mode, ask Builder to authorize THIS attempt against the
        // target host, right before connecting. Builder charges the org's
        // ZKFETCH quota pool at this step whether or not it returns a token.
        // The token is optional: Builder omits it when it has no attestor
        // signing key. When present it expires in ~10s -- it must never be
        // requested ahead of time or reused across attempts/calls.
        const client: { url: string; authRequest?: ReturnType<typeof decodeBuilderAuthorizationToken> } = {
          url: attestorUrl,
        };
        if (this.builderOrgToken) {
          const host = getHostFromUrl(url);
          const authorization = await requestBuilderAuthorization(
            this.builderBaseUrl!,
            this.builderOrgToken,
            host
          );
          if (authorization.token) {
            client.authRequest = decodeBuilderAuthorizationToken(authorization.token);
          }
        }

        const claim = await createClaimOnAttestor({
          name: "http",
          params: {
            method: (options?.method as HttpMethod) || HttpMethod.GET,
            url: url,
            responseMatches: secretOptions?.responseMatches || [
              {
                type: "regex",
                value: "(?<data>.*)",
              },
            ],
            headers: options?.headers,
            geoLocation: options?.geoLocation,
            responseRedactions: secretOptions?.responseRedactions || [],
            body: options?.body || "",
            paramValues: options?.paramValues,
          },
          context: options?.context,
          secretParams: {
            cookieStr: secretOptions?.cookieStr || "",
            headers: secretOptions?.headers || {},
            paramValues: secretOptions?.paramValues,
          },
          zkEngine: options?.zkEngine ?? 'stwo',
          ownerPrivateKey: privateKey,
          logger: logger,
          client,
        });

        if (claim.error) {
          throw new Error(
            `Failed to create claim on attestor: ${claim.error.message}`
          );
        }

        if (!this.builderOrgToken) {
          await sendLogs({
            sessionId,
            logType: LogType.PROOF_GENERATED,
            applicationId: this.applicationId,
          });
        }
        return await transformProof(claim, attestorUrl);
      } catch (error) {
        attempt++;
        if (attempt >= retries) {
          if (!this.builderOrgToken) {
            await sendLogs({
              sessionId,
              logType: LogType.ERROR,
              applicationId: this.applicationId,
            });
          }
          logger.error(error);
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, retryInterval));
      }
    }

    // Unreachable: retries >= 1 is checked above and every attempt returns or
    // throws. Kept so zkFetch is typed Promise<Proof>.
    throw new InvalidParamError('retries must be a positive integer');
  }

  /**
   * Execute zkFetch using TEE (Trusted Execution Environment)
   */
  private async zkFetchWithTee(
    url: string,
    sessionId: string,
    options?: Options,
    secretOptions?: secretOptions,
    retries = 1,
    retryInterval = 1000
  ) {
    if (!this.teeSDK) {
      throw new InvalidParamError('TEE SDK not initialized');
    }

    // Build the request for TEE SDK - format must match TEE service expectations
    const defaultHeaders = {
      "x-secure-request": "1",
    };

    const request = {
      name: "http",
      params: {
        url: url,
        method: (options?.method as HttpMethod) || HttpMethod.GET,
        headers: options?.headers,
        responseMatches: secretOptions?.responseMatches || [
          {
            type: "regex",
            value: "(?<data>.*)",
          },
        ],
        responseRedactions: teeRedactions(secretOptions?.responseRedactions),
        body: options?.body || "",
        paramValues: options?.paramValues || {},
        geoLocation: options?.geoLocation,
      },
      context: options?.context ? JSON.stringify(options.context) : undefined,
      secretParams: {
        headers: { ...defaultHeaders, ...secretOptions?.headers },
        cookieStr: secretOptions?.cookieStr || "",
        paramValues: secretOptions?.paramValues || {},
      },
    };

    const fetchedTeeUrls = await getTeeUrls();

    const teeConfig = {
      attestorUrl: fetchedTeeUrls.teeAttestorUrl,
      timeout_ms: 30000, // currently ignored by libreclaim; kept for forward compat
    };

    const maxAttempts = Math.max(retries, TEE_MIN_ATTEMPTS);

    let attempt = 0;
    while (attempt < maxAttempts) {
      try {
        // In Builder mode, authorize THIS attempt right before running it, as
        // the non-TEE path does: the token is single-use and expires in ~10s,
        // and Builder charges the org's ZKFETCH quota whether or not it
        // returns one. libreclaim forwards it to the attestor as the
        // AuthenticationRequest, re-encoded in the canonical JSON form it parses.
        let attemptRequest: typeof request & { authRequest?: string } = request;
        if (this.builderOrgToken) {
          const authorization = await requestBuilderAuthorization(
            this.builderBaseUrl!,
            this.builderOrgToken,
            getHostFromUrl(url)
          );
          if (authorization.token) {
            attemptRequest = { ...request, authRequest: encodeBuilderAuthorizationForTee(authorization.token) };
          }
        }

        const result = await this.teeSDK.executeProtocolAsync(attemptRequest, teeConfig);

        // Check for errors in TEE result (matching non-TEE path behavior)
        if (result.claim.error) {
          throw new Error(
            `Failed to create claim on TEE: ${result.claim.error}`
          );
        }

        // Devtool usage logging; Builder meters through its authorization call.
        if (!this.builderOrgToken) {
          await sendLogs({
            sessionId,
            logType: LogType.PROOF_GENERATED,
            applicationId: this.applicationId,
          });
        }

        return await transformTeeProof(result, fetchedTeeUrls.teeAttestorUrl);
      } catch (error) {
        attempt++;
        // Builder rejections (bad token, quota exhausted) aren't transient.
        if (error instanceof BuilderAuthorizationError) {
          throw error;
        }
        const canRetry =
          attempt < maxAttempts &&
          (attempt < retries || isTransientTeeError(error));
        if (!canRetry) {
          if (!this.builderOrgToken) {
            await sendLogs({
              sessionId,
              logType: LogType.ERROR,
              applicationId: this.applicationId,
            });
          }
          logger.error(error);
          throw error;
        }
        logger.warn(`TEE attempt ${attempt} failed, retrying:`, error);
        await new Promise((resolve) => setTimeout(resolve, retryInterval));
      }
    }

    // This should never be reached due to the throw in the catch block,
    // but TypeScript requires an explicit return for all code paths
    throw new InvalidParamError('TEE execution failed: no attempts were made');
  }
}
