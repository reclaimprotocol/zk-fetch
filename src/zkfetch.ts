import { createClaim } from "@reclaimprotocol/witness-sdk";
import { HttpMethod, LogType, SignedClaim } from "./types";
import { Options, Proof, secretOptions } from "./interfaces";
import { getWalletFromPrivateKey } from "./crypto";
import {
  assertCorrectnessOfOptions,
  assertValidSignedClaim,
  getWitnessesForClaim,
  replaceAll,
  validateURL,
  sendLogs,
  validateApplicationIdAndSecret,
  assertCorrectionOfSecretOptions,
} from "./utils";
import { v4 } from "uuid";
import P from "pino";
import { FetchError, ProofNotVerifiedError } from "./errors";
import { getIdentifierFromClaimInfo } from "./witness";
import canonicalize from "canonicalize";
import { ethers } from "ethers";
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
    ecdsaPrivateKey?: string,
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
    if (!ecdsaPrivateKey) {
      const wallet = await getWalletFromPrivateKey(this.applicationSecret);
      ecdsaPrivateKey = wallet.privateKey;
    }
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
        const claim = await createClaim({
          name: "http",
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
            responseRedactions: [],
            body: fetchOptions.body,
          },
          secretParams: {
            cookieStr: "abc=pqr",
            ...secretOptions,
          },
          ownerPrivateKey: ecdsaPrivateKey,
          logger: logger,
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

  async verifyProof(proof: Proof) {
    if (!proof.signatures.length) {
      throw new Error("No signatures");
    }
    const witnesses = await getWitnessesForClaim(
      proof.claimData.epoch,
      proof.identifier,
      proof.claimData.timestampS
    );

    try {
      // then hash the claim info with the encoded ctx to get the identifier
      const calculatedIdentifier = getIdentifierFromClaimInfo({
        parameters: JSON.parse(
          canonicalize(proof.claimData.parameters) as string
        ),
        provider: proof.claimData.provider,
        context: proof.claimData.context,
      });
      proof.identifier = replaceAll(proof.identifier, '"', "");
      // check if the identifier matches the one in the proof
      if (calculatedIdentifier !== proof.identifier) {
        throw new ProofNotVerifiedError("Identifier Mismatch");
      }

      const signedClaim: SignedClaim = {
        claim: {
          ...proof.claimData,
        },
        signatures: proof.signatures.map((signature) => {
          return ethers.getBytes(signature);
        }),
      };

      // verify the witness signature
      assertValidSignedClaim(signedClaim, witnesses);
    } catch (e: Error | unknown) {
      logger.error(e);
      return false;
    }
    return true;
  }
}
