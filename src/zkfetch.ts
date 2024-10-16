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
import { FetchError } from "./errors";
import { WITNESS_NODE_URL } from "./constants";
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
    retries = 1,
    retryInterval = 1000
  ) {
    validateURL(url, "zkFetch");
    if (options !== undefined) {
      assertCorrectnessOfOptions(options);
    }
    const fetchOptions = {
      method: options?.method || HttpMethod.GET,
      body: options?.body,
      headers: { ...options?.headers, ...secretOptions?.headers },
    };
    await sendLogs({
      sessionId: this.sessionId,
      logType: LogType.VERIFICATION_STARTED,
      applicationId: this.applicationId,
    });

    let attempt = 0;
    while (attempt < retries) {
      try {
        let fetchResponse = "";
        if (
          !secretOptions?.responseMatches &&
          !secretOptions?.responseRedactions && 
          !secretOptions?.paramValues
        ) {
          const response = await fetch(url, fetchOptions);
          if (!response.ok) {
            throw new FetchError(
              `Failed to fetch ${url} with status ${response.status}`
            );
          }
          fetchResponse = await response.text();
        }
        const claim = await createClaimOnAttestor({
          name: "http",
          params: {
            method: fetchOptions.method as HttpMethod,
            url: url,
            responseMatches: secretOptions?.responseMatches || [
              {
                type: "contains",
                value: fetchResponse,
              },
            ],
            headers: options?.headers,
            geoLocation: options?.geoLocation,
            responseRedactions: secretOptions?.responseRedactions || [],
            body: fetchOptions.body || "",
            paramValues: options?.paramValues,
          },
          secretParams: {
            cookieStr: secretOptions?.cookieStr || "",
            headers: secretOptions?.headers || {},
            paramValues: secretOptions?.paramValues,
          },
          ownerPrivateKey: this.applicationSecret,
          logger: logger,
          client: {
            url: WITNESS_NODE_URL,
          },
        });
        if (claim.error) {
          throw new Error(`Failed to create claim on witness: ${claim.error.message}`);
        }

        await sendLogs({
          sessionId: this.sessionId,
          logType: LogType.PROOF_GENERATED,
          applicationId: this.applicationId,
        });
        return transformProof(claim);
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
