import { ClaimTunnelResponse } from "@reclaimprotocol/attestor-core/lib/proto/api";

export enum HttpMethod {
    GET = "GET",
    POST = "POST",
    PUT = "PUT",
}

export enum LogType {
    VERIFICATION_STARTED = 'VERIFICATION_STARTED',
    PROOF_GENERATED = 'PROOF_GENERATED',
    ERROR = 'ERROR',
    SUCCESS = 'SUCCESS',
    FAILED = 'FAILED'
}

export type ProofRequestOptions = {
    log?: boolean;
    sessionId?: string;
}  

export type MechainResponse = {
    taskId: number;
    responses: ClaimTunnelResponse[];
}

export type ApplicationId = string;
export type ApplicationSecret = string;
export type RequestUrl = string;
export type ProviderId = string;
export type NoReturn = void;
export type SessionId = string;