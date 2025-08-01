import {
  createClaimOnAttestor,
  createClaimOnMechain,
} from "@reclaimprotocol/attestor-core";
import { HttpMethod, LogType, MechainResponse } from "./types";
import { Options, Proof, secretOptions } from "./interfaces";
import {
  assertCorrectnessOfOptions,
  validateURL,
  sendLogs,
  validateApplicationIdAndSecret,
  transformProof,
} from "./utils";
import { v4 } from "uuid";
import P from "pino";
import { ATTESTOR_NODE_URL } from "./constants";
import { ClaimTunnelResponse } from "@reclaimprotocol/attestor-core/lib/proto/api";
const logger = P();

export class ReclaimClient {
  applicationId: string;
  applicationSecret: string;
  logs?: boolean;
  sessionId: string;
  constructor(
    applicationId: string,
    applicationSecret: string,
    logs?: boolean
  ) {
    validateApplicationIdAndSecret(applicationId, applicationSecret);
    this.applicationId = applicationId;
    this.applicationSecret = applicationSecret;
    this.sessionId = v4().toString();
    // if the logs are enabled, set the logger level to info
    logger.level = logs ? "info" : "silent";
    logger.info(
      `Initializing client with applicationId: ${this.applicationId} and sessionId: ${this.sessionId}`
    );
  }

  async zkFetch(
    url: string,
    options?: Options,
    secretOptions?: secretOptions,
    isDecentralised?: boolean,
    retries = 1,
    retryInterval = 1000
  ) {
    validateURL(url, "zkFetch");
    if (options !== undefined) {
      assertCorrectnessOfOptions(options);
    }
    await sendLogs({
      sessionId: this.sessionId,
      logType: LogType.VERIFICATION_STARTED,
      applicationId: this.applicationId,
    });

    let attempt = 0;
    while (attempt < retries) {
      try {
        let claim: ClaimTunnelResponse | MechainResponse;
        if (isDecentralised) {
          claim = await createClaimOnMechain({
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
            ownerPrivateKey: this.applicationSecret,
            logger: logger,
            client: {
              url: ATTESTOR_NODE_URL,
            },
          });

          await sendLogs({
            sessionId: this.sessionId,
            logType: LogType.PROOF_GENERATED,
            applicationId: this.applicationId,
          });

          return claim.responses.map(transformProof);
        } else {
          claim = await createClaimOnAttestor({
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
            ownerPrivateKey: this.applicationSecret,
            logger: logger,
            client: {
              url: ATTESTOR_NODE_URL,
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
          return transformProof(claim);
        }
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
