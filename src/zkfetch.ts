import { createClaimOnAttestor } from "@reclaimprotocol/attestor-core";
import { HttpMethod, LogType } from "./types";
import { Options, secretOptions, ReclaimClientOptions, SignatureData } from "./interfaces";
import {
  assertCorrectnessOfOptions,
  validateURL,
  sendLogs,
  validateApplicationIdAndSecret,
  transformProof,
  getAttestorUrl,
  isUrlAllowed,
  getOrCreateOwnerKey,
} from "./utils";
import { v4 } from "uuid";
import P from "pino";
import { verifySessionSignature } from "./signature";
import { InvalidParamError } from "./errors";
const logger = P();

export class ReclaimClient {
  applicationId: string;
  applicationSecret?: string;
  signatureData?: SignatureData;
  ownerKey?: string;
  logs?: boolean;
  sessionId: string;

  /**
   * Creates a new ReclaimClient instance
   * @param applicationId - Your Reclaim application ID
   * @param options - Configuration options (signature or applicationSecret)
   */
  constructor(applicationId: string, options: ReclaimClientOptions);
  constructor(applicationId: string, applicationSecret: string, logs?: boolean);
  constructor(
    applicationId: string,
    optionsOrSecret: ReclaimClientOptions | string,
    logsParam?: boolean
  ) {
    let applicationSecret: string | undefined;
    let signature: string | undefined;
    let logs: boolean | undefined;

    if (typeof optionsOrSecret === 'string') {
      // Backward compatible API: constructor(applicationId, applicationSecret, logs?)
      applicationSecret = optionsOrSecret;
      logs = logsParam;
    } else {
      // New API: constructor(applicationId, options)
      applicationSecret = optionsOrSecret.applicationSecret;
      signature = optionsOrSecret.signature;
      logs = optionsOrSecret.logs;
    }

    // Validate that exactly one auth method is provided
    if (applicationSecret && signature) {
      throw new InvalidParamError('Cannot provide both applicationSecret and signature. Use only one.');
    }

    if (!applicationSecret && !signature) {
      throw new InvalidParamError('Must provide either applicationSecret (backend) or signature (frontend).');
    }

    // Validate applicationId
    if (!applicationId || typeof applicationId !== 'string') {
      throw new InvalidParamError('applicationId must be a non-empty string');
    }

    this.applicationId = applicationId;
    this.sessionId = v4().toString();
    this.logs = logs;

    // Set up logger
    logger.level = logs ? "info" : "silent";

    if (applicationSecret) {
      // Backend mode: validate and store secret
      validateApplicationIdAndSecret(applicationId, applicationSecret);
      this.applicationSecret = applicationSecret;
      logger.info(
        `Initializing client with applicationId: ${this.applicationId} and sessionId: ${this.sessionId}`
      );
    } else if (signature) {
      // Frontend mode: verify and store signature data
      this.signatureData = verifySessionSignature(signature);

      // Verify the signature's applicationId matches
      if (this.signatureData.applicationId.toLowerCase() !== applicationId.toLowerCase()) {
        throw new InvalidParamError('Signature applicationId does not match provided applicationId');
      }

      // Generate or retrieve owner key for frontend use
      this.ownerKey = getOrCreateOwnerKey(this.applicationId);

      logger.info(
        `Initializing client (frontend mode) with applicationId: ${this.applicationId} and sessionId: ${this.sessionId}`
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
      signatureId: this.signatureData?.signatureId,
    });

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
            signatureId: this.signatureData?.signatureId,
          });
        return await transformProof(claim);
      } catch (error) {
        attempt++;
        if (attempt >= retries) {
          await sendLogs({
            sessionId: this.sessionId,
            logType: LogType.ERROR,
            applicationId: this.applicationId,
            signatureId: this.signatureData?.signatureId,
          });
          logger.error(error);
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, retryInterval));
      }
    }
  }
}
