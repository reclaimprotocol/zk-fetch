import { createClaimOnWitness } from "@reclaimprotocol/witness-sdk";
import { HttpMethod, LogType } from "./types";
import { Options, secretOptions } from "./interfaces";
import {
  assertCorrectnessOfOptions,
  validateURL,
  sendLogs,
  validateApplicationIdAndSecret,
  assertCorrectionOfSecretOptions,
} from "./utils";
import { v4 } from "uuid";
import P from "pino";
import { FetchError } from "./errors";
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
    if (secretOptions)  {
      assertCorrectionOfSecretOptions(secretOptions);
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
        const response = await fetch(url, fetchOptions);
        if (!response.ok) {
          throw new FetchError(
            `Failed to fetch ${url} with status ${response.status}`
          );
        }
        const fetchResponse = await response.text();
        const claim = await createClaimOnWitness({
          name: 'http',
          params: {
            method: fetchOptions.method as HttpMethod,
            url: url,
            responseMatches: [
              {
                type: "contains",
                value: fetchResponse,
              },
            ],
            headers: options?.headers,
            geoLocation: options?.geoLocation,
            responseRedactions: [],
            body: fetchOptions.body,
          },
          secretParams: {
            cookieStr: "abc=pqr",
            ...secretOptions,
          },
          ownerPrivateKey: this.applicationSecret,
          logger: logger,       
          client: {
            url: "wss://witness.reclaimprotocol.org/ws"
          }
        });

        await sendLogs({
          sessionId: this.sessionId,
          logType: LogType.PROOF_GENERATED,
          applicationId: this.applicationId,
        });
        return claim;
      } catch (error: any) {
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
