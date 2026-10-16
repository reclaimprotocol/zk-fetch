export class InvalidParamError extends Error {
    constructor(message?: string) {
        super(message)
        this.name = 'InvalidParamError'
    }
}

export class InvalidMethodError extends Error {
    constructor(message?: string) {
        super(message)
        this.name = 'InvalidMethodError'
    }
}

export class FetchError extends Error {
    constructor(message?: string) {
        super(message)
        this.name = 'FetchError'
    }
}

export class NetworkError extends Error {
    constructor(message?: string) {
        super(message)
        this.name = 'NetworkError'
    }
}

export class ApplicationError extends Error {
    constructor(message?: string) {
        super(message)
        this.name = 'ApplicationError'
    }
}

/**
 * Base class for failures returned by Builder's `/fetch/authorizations`
 * endpoint (Builder-mode zkFetch). Catch this (or a subclass) rather than
 * a generic Error to react to Builder-specific failures.
 */
export class BuilderAuthorizationError extends Error {
    /** HTTP status Builder responded with, when known. */
    public readonly status?: number;

    constructor(message?: string, status?: number) {
        super(message)
        this.name = 'BuilderAuthorizationError'
        this.status = status
    }
}

/**
 * Thrown when Builder rejects an authorization request because the org's
 * `ZKFETCH` quota pool is exhausted (HTTP 402 or 429). Distinguishable from
 * other Builder failures so a caller can catch it specifically and, e.g.,
 * surface a "you're out of zkFetch quota" message rather than a generic error.
 */
export class BuilderQuotaExceededError extends BuilderAuthorizationError {
    constructor(status: number, message?: string) {
        super(message || `Builder zkFetch quota exceeded (HTTP ${status})`, status)
        this.name = 'BuilderQuotaExceededError'
    }
}