import { createClaimOnAttestor } from "@reclaimprotocol/attestor-core";
import { HttpMethod, LogType } from "./types";
import { Options, secretOptions } from "./interfaces";
import {
  assertCorrectnessOfOptions,
  validateURL,
  sendLogs,
  validateApplicationIdAndSecret,
  transformProof,
} from "./utils";
import { v4 } from "uuid";
import P from "pino";
import { APP_BACKEND_URL, ATTESTOR_NODE_URL } from "./constants";
const logger = P();

export class ReclaimClient {
  applicationId: string;
  applicationSecret: string;
  logs?: boolean;
  sessionId: string;
  appBackendUrl?: string;
  constructor(
    applicationId: string,
    applicationSecret: string,
    logs?: boolean,
    appBackendUrl?: string
  ) {
    validateApplicationIdAndSecret(applicationId, applicationSecret);
    this.applicationId = applicationId;
    this.applicationSecret = applicationSecret;
    this.sessionId = v4().toString();
    this.appBackendUrl = appBackendUrl || APP_BACKEND_URL;
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
      appBackendUrl: this.appBackendUrl || APP_BACKEND_URL,
    });

    let attempt = 0;
    while (attempt < retries) {
      try {
        const claim = await createClaimOnAttestor({
          name: "http",
          params: {
            method: options?.method as HttpMethod || HttpMethod.GET,
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
          throw new Error(`Failed to create claim on attestor: ${claim.error.message}`);
        }

        await sendLogs({
          sessionId: this.sessionId,
          logType: LogType.PROOF_GENERATED,
          applicationId: this.applicationId,
          appBackendUrl: this.appBackendUrl || APP_BACKEND_URL,
        });
        return transformProof(claim);
      } catch (error) {
        attempt++;
        if (attempt >= retries) {
          await sendLogs({
            sessionId: this.sessionId,
            logType: LogType.ERROR,
            applicationId: this.applicationId,
            appBackendUrl: this.appBackendUrl || APP_BACKEND_URL,
          });
          logger.error(error);
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, retryInterval));
      }
    }
  }
}
