import { ProviderClaimData } from "./interfaces";

export enum HttpMethod {
    GET = "GET",
    POST = "POST",
}

export type DisallowedOption = "mode" | "cache" | "credentials" | "redirect" | "referrerPolicy"


export enum LogType {
    VERIFICATION_STARTED = 'VERIFICATION_STARTED',
    PROOF_GENERATED = 'PROOF_GENERATED',
    ERROR = 'ERROR',
    SUCCESS = 'SUCCESS',
    FAILED = 'FAILED'
}

export type ClaimID = ProviderClaimData['identifier'];

export type ClaimInfo = Pick<
  ProviderClaimData,
  'context' | 'provider' | 'parameters'
>;


export type AnyClaimInfo =
  | ClaimInfo
  | {
    identifier: ClaimID;
  };


export type ProofRequestOptions = {
    log?: boolean;
    sessionId?: string;
}
  
export type CompleteClaimData = Pick<
  ProviderClaimData,
  'owner' | 'timestampS' | 'epoch'
> &
  AnyClaimInfo;

  
export type SignedClaim = {
    claim: CompleteClaimData;
    signatures: Uint8Array[];
  };
  

export type ApplicationId = string;
export type ApplicationSecret = string;
export type RequestUrl = string;
export type ProviderId = string;
export type NoReturn = void;
export type SessionId = string;