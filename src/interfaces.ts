import { LogType } from "./types";

// TEE Error codes matching C enum
export enum ReclaimError {
  SUCCESS = 0,
  INVALID_ARGS = -1,
  CONNECTION_FAILED = -2,
  PROTOCOL_FAILED = -3,
  TIMEOUT = -4,
  MEMORY = -5,
  SESSION_NOT_FOUND = -6,
  ALREADY_COMPLETED = -7,
}

// Algorithm IDs for ZK circuits
export enum AlgorithmID {
  CHACHA20_OPRF = 3,
  AES_128_OPRF = 4,
  AES_256_OPRF = 5,
}

export interface Options {
  method: string
  body?: string;
  headers?: { [key: string]: string };
  geoLocation?: string;
  paramValues?: { [key: string]: string };
  context?: { contextAddress: string, contextMessage: string };
  /** Enable TEE mode for this request (default: false) */
  useTee?: boolean;
  /** ZK proof engine for the non-TEE path. Defaults to 'stwo'; switch to
   *  'snarkjs' if you need it for circuits with larger witness sizes.
   *  Ignored when `useTee` is true. */
  zkEngine?: 'snarkjs' | 'stwo';
}




export interface secretOptions {
  headers?: { [key: string]: string };
  responseMatches?: { type: 'regex' | 'contains', value: string }[];
  /** Locate the byte span to redact via `regex`, `jsonPath`, or `xPath`.
   *  Optional `hash` swaps the plain redaction for an OPRF commitment, so
   *  `extractedParameterValues.<name>` returns the hash string instead of
   *  the plaintext value:
   *   - 'oprf'     — TEE path only (`useTee: true`); commitment is computed inside the enclave.
   *   - 'oprf-raw' — non-TEE / proxy path only; forces the stwo zkEngine. */
  responseRedactions?: { regex?: string, jsonPath?: string, xPath?: string, hash?: 'oprf' | 'oprf-raw' }[];
  cookieStr?: string;
  paramValues?: { [key: string]: string };
}

export interface SendLogsParams {
  sessionId: string;
  logType: LogType;
  applicationId: string;
}


export interface Proof {
  identifier: string;
  claimData: ProviderClaimData;
  signatures: string[];
  witnesses: WitnessData[];
  extractedParameterValues: any;
}

export interface WitnessData {
  id: string;
  url: string;
}


export interface ProviderClaimData {
  provider: string;
  parameters: string;
  owner: string;
  timestampS: number;
  context: string;
  identifier: string;
  epoch: number;
}



export interface SignatureConfig {
  applicationId: string;
  applicationSecret: string;
  allowedUrls: string[];
  expiresAt?: number;
}

export interface SignatureData {
  applicationId: string;
  allowedUrls: string[];
  expiresAt: number;
}

// TEE SDK Interfaces

/** TEE attestor signature */
export interface TeeSignature {
  attestor_address: string;
  claim_signature: string;
}

/** TEE claim data from protocol execution */
export interface TeeClaimData {
  identifier: string;
  owner: string;
  provider: string;
  parameters: string;
  context: string;
  timestamp_s: number;
  epoch: number;
  error?: string;
}

/** TEE protocol execution result */
export interface TeeProtocolResult {
  claim: TeeClaimData;
  signatures: TeeSignature[];
}

/** TEE provider request */
export interface TeeProviderRequest {
  name: string;
  secretParams?: Record<string, unknown>;
  context?: string;
  [key: string]: unknown;
}

/** Runtime config passed through to libreclaim's executeProtocol. Matches the
 *  Go-side `ConfigJSON` shape — `timeout_ms` is currently not honored by the
 *  Go config struct and will be silently ignored. */
export interface TeeReclaimConfig {
  teekUrl?: string;
  teetUrl?: string;
  attestorUrl?: string;
  timeout_ms?: number;
  [key: string]: unknown;
}

/** TEE WebSocket endpoints used by the TEE path. Currently hardcoded in
 *  `getTeeUrls()` (see src/utils.ts). */
export interface TeeUrls {
  teekUrl: string;
  teetUrl: string;
  teeAttestorUrl: string;
}