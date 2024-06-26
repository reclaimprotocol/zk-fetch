import { ApplicationError, DisallowedOptionError, InvalidMethodError, InvalidParamError, NetworkError } from './errors';
import { ApplicationId, ApplicationSecret, DisallowedOption, HttpMethod } from './types'
import { Options, secretOptions, SendLogsParams } from './interfaces';
import { ethers } from 'ethers';
import { APP_BACKEND_URL, LOGS_BACKEND_URL } from './constants';
import P from "pino";
const logger = P();

/*
  Options validations utils
*/
export function assertCorrectnessOfOptions(options: Options): void {
  if (!options.method) {
    throw new InvalidParamError('Method is required');
  }
  if (options.method !== HttpMethod.GET && options.method !== HttpMethod.POST) {
     throw new InvalidMethodError(`Method ${options.method} is not allowed`);
  }
  const disallowedOptions: DisallowedOption[] = ["mode", "cache", "credentials", "redirect", "referrerPolicy"];
  for (const option of disallowedOptions) {
    if (options[option as keyof Options]) {
      throw new DisallowedOptionError(`Option: ${option} is not allowed`);
    }
  }
}

export function assertCorrectionOfSecretOptions(secretOptions: secretOptions): void {
  if(secretOptions.body){
    throw new DisallowedOptionError(`Option: body is not allowed`);
  }
}


/*
  Params validations utils
*/
export function validateNotNullOrUndefined(input: any, paramName: string, functionName: string) {
    if (input == null) {
      throw new InvalidParamError(`${paramName} passed to ${functionName} must not be null or undefined.`);
    }
  }
  
  export function validateNonEmptyString(input: string, paramName: string, functionName: string) {
    if (typeof input !== 'string') {
      throw new InvalidParamError(`${paramName} passed to ${functionName} must be a string.`);
    }
    if (input.trim() === "") {
      throw new InvalidParamError(`${paramName} passed to ${functionName} must be a non-empty string.`);
    }
  }


/* validate applicationId and applicationSecret */
export function validateApplicationIdAndSecret(applicationId: ApplicationId, applicationSecret: ApplicationSecret): void {
  validateNotNullOrUndefined(applicationId, 'applicationId', 'the constructor');
  validateNonEmptyString(applicationId, 'applicationId', 'the constructor');
  validateNotNullOrUndefined(applicationSecret, 'applicationSecret', 'the constructor');
  validateNonEmptyString(applicationSecret, 'applicationSecret', 'the constructor');
 try{
    const wallet = new ethers.Wallet(applicationSecret);
    if(wallet.address !== applicationId){
      throw new InvalidParamError(`Invalid applicationId and applicationSecret passed to the constructor.`);
    }
 }
  catch (error) {
    throw new InvalidParamError(`Invalid applicationId and applicationSecret passed to the constructor.`);
  }
}

/* 
  URL validations utils
*/
export function validateURL(url: string, functionName: string): void {
    validateNotNullOrUndefined(url, 'url', functionName)
    validateNonEmptyString(url, 'url', functionName)
    try {
      new URL(url);
    } catch (e) {
      throw new InvalidParamError(`Invalid URL format passed to ${functionName}.`);
    }
  }
   

// cache for app name to avoid multiple fetches 
const appNameCache: { [key: string]: string } = {};
export async function fetchAppById(appId: string): Promise<string> {
  if (appNameCache[appId]) {
    return appNameCache[appId];
  }
  try {
    const response = await fetch(`${APP_BACKEND_URL}/api/zkfetch/sdk/${appId}`);
    if (response.status === 404) {
      throw new ApplicationError('Application not found');
    }
    if (response.status !== 200) {
      throw new ApplicationError('Failed to fetch application');
    }

    const res = await response.json();
    const appName = res.application.applicationName;
    appNameCache[appId] = appName; // Update cache
    return appName;
  } catch (err) {
    throw new ApplicationError('Application not found');
  }
}

/* 
 sendLogs utils
*/
export async function sendLogs(
  { 
      sessionId, 
      logType, 
      applicationId,
      }: SendLogsParams
  ): Promise<void> {
    try {
      const getAppName = await fetchAppById(applicationId);
      const url = `${LOGS_BACKEND_URL}/api/business-logs/zkfetch`
      const body = JSON.stringify({
          sessionId,
          logType,
          date: new Date().toISOString(),
          applicationId: applicationId,
          applicationName: getAppName,
      })
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body,
      })
  
      if (!response.ok) {
        logger.error('Failed to send logs')
      }
    } catch (error) {
      if (error instanceof ApplicationError) {
        throw error
      } 
      throw new NetworkError('Failed to send logs')
    }
  }
  