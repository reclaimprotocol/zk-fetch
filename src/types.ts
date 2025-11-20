
export enum HttpMethod {
    GET = "GET",
    POST = "POST",
    PUT = "PUT",
}

export enum LogType {
    SESSION_TOKEN_GENERATED = 'SESSION_TOKEN_GENERATED',
    SESSION_TOKEN_FAILED = 'SESSION_TOKEN_FAILED',
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

export type ApplicationId = string;
export type ApplicationSecret = string;
export type RequestUrl = string;
export type ProviderId = string;
export type NoReturn = void;
export type SessionId = string;