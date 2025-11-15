import { LogType } from "./types";

export interface Options {
    method: string
    body?: string;
    headers?: { [key: string]: string };
    geoLocation?: string;
    paramValues?: { [key: string]: string };
    context?: { contextAddress: string, contextMessage: string };
}

/**
 * Constructor options for ReclaimClient
 * Use either applicationSecret (backend only) or signature (frontend safe)
 */
export interface ReclaimClientOptions {
  /** Enable logging (default: false) */
  logs?: boolean;
  /** Application secret (private key) - Backend only! Do not use in frontend */
  applicationSecret?: string;
  /** Signed token from backend - Safe for frontend use */
  signature?: string;
}

export interface secretOptions {
  headers?: { [key: string]: string };
  responseMatches?: { type: 'regex' | 'contains', value: string }[];
  responseRedactions?: { regex?: string, jsonPath?: string, xPath?: string }[];
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
  version: string;
  tempPrivateKey: string;
  tempAddress: string;
}