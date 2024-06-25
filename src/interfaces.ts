import { LogType } from "./types";

export interface Options {
    method: string
    body?: string;
    headers?: { [key: string]: string };
}

export interface secretOptions {
  body?: string;
  headers?: { [key: string]: string };
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
  publicData?: { [key: string]: string };
}


export interface RequestedProofs {
  id: string;
  sessionId: string;
  name: string;
  claims: RequestedClaim[];
}

export interface RequestedClaim {
  provider: string;
  context: string;
  httpProviderId: string;
  payload: Payload;
}

export interface Payload {
  url: string;
  urlType: 'CONSTANT' | 'REGEX';
  method: 'GET' | 'POST';
  login: {
    url: string;
  };
  responseSelections: {
    invert: boolean
    responseMatch: string;
    xPath?: string;
    jsonPath?: string;
  }[];
  headers?: { [key: string]: string };
  customInjection?: string;
  bodySniff?: {
    enabled: boolean;
    regex?: string;
  };
  userAgent?: {
    ios?: string;
    android?: string;
  };
  geoLocation?: string;
  matchType?: string;
  injectionType: string
  disableRequestReplay: boolean
  parameters: { [key: string]: string | undefined }
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
  

  export interface WitnessData {
    id: string;
    url: string;
  }


  /* Beacon */
  export interface Beacon {
    getState(epoch?: number): Promise<BeaconState>;
    close?(): Promise<void>;
  }
  
  export type BeaconState = {
    witnesses: WitnessData[];
    epoch: number;
    witnessesRequiredForClaim: number;
    nextEpochTimestampS: number;
  };
  
