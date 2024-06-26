export class InvalidParamError extends Error {
    constructor(message?: string) {
        super(message)
        this.name = 'InvalidParamError'
    }
}


export class DisallowedOptionError extends Error {
    constructor(message?: string) {
        super(message)
        this.name = 'DisallowedOptionError'
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