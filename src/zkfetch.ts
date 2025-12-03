import { createClaimOnAttestor } from "@reclaimprotocol/attestor-core";
import { HttpMethod, LogType } from "./types";
import { Options, secretOptions, SignatureData, ReclaimClientOptions } from "./interfaces";
import {
  assertCorrectnessOfOptions,
  validateURL,
  sendLogs,
  validateApplicationIdAndSecret,
  transformProof,
  getAttestorUrl,
  getTeeUrls,
  isUrlAllowed,
  getOrCreateOwnerKey,
} from "./utils";
import { v4 } from "uuid";
import P from "pino";
import { verifySessionSignature } from "./signature";
import { InvalidParamError } from "./errors";
import { ReclaimSDK } from "./tee";
const logger = P();

export class ReclaimClient {
  applicationId: string;
  applicationSecret?: string;
  signatureData?: SignatureData;
  ownerKey?: string;
  logs?: boolean;
  tee?: boolean;
  private teeSDK?: ReclaimSDK;
  sessionId: string;

  /**
   * Creates a new ReclaimClient instance
   * @param applicationId - Your Reclaim application ID
   * @param applicationSecret - Either application secret (0x...) or signature (ey...)
   * @param logs - Enable logging (optional, default: false)
   * @param tee - Enable TEE mode (optional, default: false)
   */
  constructor(
    applicationId: string,
    applicationSecret: string,
    options?: ReclaimClientOptions
  ) {
    // Validate applicationId
    if (!applicationId || typeof applicationId !== 'string') {
      throw new InvalidParamError('applicationId must be a non-empty string');
    }

    // Validate applicationSecret
    if (!applicationSecret || typeof applicationSecret !== 'string') {
      throw new InvalidParamError('applicationSecret must be a non-empty string');
    }

    this.applicationId = applicationId;
    this.sessionId = v4().toString();
    this.logs = options?.logs;
    this.tee = options?.useTee;

    // Set up logger
    logger.level = options?.logs ? "info" : "silent";

    // Initialize TEE SDK if TEE mode is enabled
    if (options?.useTee) {
      this.teeSDK = new ReclaimSDK();
      this.teeSDK.init();
    }

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
    retries = 1,
    retryInterval = 1000
  ) {
    validateURL(url, "zkFetch");
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
    if (this.applicationSecret) {
      privateKey = this.applicationSecret;
    } else if (this.ownerKey) {
      // Use the client-generated owner key
      privateKey = this.ownerKey;
    } else {
      throw new InvalidParamError('No authentication method available');
    }

    await sendLogs({
      sessionId: this.sessionId,
      logType: LogType.VERIFICATION_STARTED,
      applicationId: this.applicationId,
    });

    // Use TEE execution path if TEE mode is enabled
    if (this.tee && this.teeSDK) {
      return await this.zkFetchWithTee(url, options, secretOptions, retries, retryInterval);
    }

    // Fetch attestor URL from feature flags
    const attestorUrl = await getAttestorUrl();

    let attempt = 0;
    while (attempt < retries) {
      try {
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
          ownerPrivateKey: privateKey,
          logger: logger,
          client: {
            url: attestorUrl,
          },
        });

        if (claim.error) {
          throw new Error(
            `Failed to create claim on attestor: ${claim.error.message}`
          );
        }

        await sendLogs({
          sessionId: this.sessionId,
          logType: LogType.PROOF_GENERATED,
          applicationId: this.applicationId,
        });
        return await transformProof(claim);
      } catch (error) {
        attempt++;
        if (attempt >= retries) {
          await sendLogs({
            sessionId: this.sessionId,
            logType: LogType.ERROR,
            applicationId: this.applicationId,
          });
          logger.error(error);
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, retryInterval));
      }
    }
  }

  /**
   * Execute zkFetch using TEE (Trusted Execution Environment)
   */
  private async zkFetchWithTee(
    url: string,
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
        responseMatches: secretOptions?.responseMatches || [
          {
            type: "regex",
            value: "(?<data>.*)",
          },
        ],
        responseRedactions: secretOptions?.responseRedactions || [],
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

    // Build TEE config - user-provided URLs take precedence over feature flags
    const teeConfig = {
      teek_url: fetchedTeeUrls.teekUrl,
      teet_url: fetchedTeeUrls.teetUrl,
      // default 30s timeout
      timeout_ms: 30000,
    };

    let attempt = 0;
    while (attempt < retries) {
      try {
        const result = await this.teeSDK.executeProtocolAsync(request, teeConfig);

        await sendLogs({
          sessionId: this.sessionId,
          logType: LogType.PROOF_GENERATED,
          applicationId: this.applicationId,
        });

        // Transform TEE result to match the standard Proof format
        return {
          identifier: result.claim.identifier,
          claimData: {
            provider: result.claim.provider,
            parameters: result.claim.parameters,
            owner: result.claim.owner,
            timestampS: result.claim.timestamp_s,
            context: result.claim.context,
            identifier: result.claim.identifier,
            epoch: result.claim.epoch,
          },
          signatures: result.signatures.map(sig => sig.claim_signature),
          witnesses: result.signatures.map(sig => ({
            id: sig.attestor_address,
            url: teeConfig.teek_url,
          })),
          extractedParameterValues: result.claim.context
            ? JSON.parse(result.claim.context)?.extractedParameters
            : '',
        };
      } catch (error) {
        attempt++;
        if (attempt >= retries) {
          await sendLogs({
            sessionId: this.sessionId,
            logType: LogType.ERROR,
            applicationId: this.applicationId,
          });
          logger.error(error);
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, retryInterval));
      }
    }
  }
}
