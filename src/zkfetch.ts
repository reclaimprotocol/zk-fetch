import { createClaimOnAttestor } from "@reclaimprotocol/attestor-core";
import { HttpMethod, LogType } from "./types";
import { Options, secretOptions, SignatureData } from "./interfaces";
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
   * @param applicationSecret - Either application secret (0x...) or signature (ey...)
   * @param logs - Enable logging (optional, default: false)
   */
  constructor(
    applicationId: string,
    applicationSecret: string,
    logs?: boolean
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
    this.logs = logs;

    // Set up logger
    logger.level = logs ? "info" : "silent";

    // Auto-detect authentication method based on format and length
    if (applicationSecret.startsWith('0x')) {
      if (applicationSecret.length < 10) {
        throw new InvalidParamError('Invalid application secret: too short');
      }

      validateApplicationIdAndSecret(applicationId, applicationSecret);
      this.applicationSecret = applicationSecret;

      logger.info(
        `Initializing backend client with applicationId: ${this.applicationId} and sessionId: ${this.sessionId}`
      );
    } else if (applicationSecret.startsWith('ey') && applicationSecret.includes('.')) {
      const parts = applicationSecret.split('.');
      if (parts.length !== 3 && parts.length !== 2) {
        throw new InvalidParamError('Invalid signature: must have 2 or 3 parts separated by dots');
      }

      this.signatureData = verifySessionSignature(applicationSecret);

      if (this.signatureData.applicationId.toLowerCase() !== applicationId.toLowerCase()) {
        throw new InvalidParamError('Signature applicationId does not match provided applicationId');
      }

      this.ownerKey = getOrCreateOwnerKey(this.applicationId);

      logger.info(
        `Initializing  client with applicationId: ${this.applicationId} and sessionId: ${this.sessionId}`
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
}
