import { ApplicationError, InvalidMethodError, InvalidParamError, NetworkError } from './errors';
import { ApplicationId, ApplicationSecret, HttpMethod } from './types'
import { Options, Proof, SendLogsParams } from './interfaces';
import { ethers } from 'ethers';
import { APP_BACKEND_URL, LOGS_BACKEND_URL, ATTESTOR_NODE_URL } from './constants';
import P from "pino";
import { ClaimTunnelResponse } from '@reclaimprotocol/attestor-core/lib/proto/api';
const logger = P();

interface FeatureFlag {
  name: string;
  value: string;
  type: string;
}

let cachedAttestorUrl: string | null = null;

/**
 * Fetches the attestor URL from the feature flag API
 * Falls back to hardcoded constant if API fails
 * Caches the result for subsequent calls
 */
export async function getAttestorUrl(): Promise<string> {
  // Return cached value if available
  if (cachedAttestorUrl) {
    return cachedAttestorUrl;
  }

  try {
    const response = await fetch(
      `${APP_BACKEND_URL}/api/feature-flags/get?featureFlagNames=zkFetchAttestorURL`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Feature flag API returned ${response.status}`);
    }

    const flags: FeatureFlag[] = await response.json();
    const attestorFlag = flags.find(f => f.name === 'zkFetchAttestorURL');

    if (attestorFlag && attestorFlag.value) {
      cachedAttestorUrl = attestorFlag.value;
      return cachedAttestorUrl;
    }

    // Flag not found, use fallback
    cachedAttestorUrl = ATTESTOR_NODE_URL;
    return cachedAttestorUrl;
  } catch (error) {
    // API failed, use fallback
    logger.warn('Failed to fetch attestor URL from feature flags, using fallback:', error);
    cachedAttestorUrl = ATTESTOR_NODE_URL;
    return cachedAttestorUrl;
  }
}

/*
  Options validations utils
*/
export function assertCorrectnessOfOptions(options: Options): void {
  if (!options.method) {
    throw new InvalidParamError('Method is required');
  }
  if (options.method !== HttpMethod.GET && options.method !== HttpMethod.POST && options.method !== HttpMethod.PUT) {
    throw new InvalidMethodError(`Method ${options.method} is not allowed`);
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
  try {
    const wallet = new ethers.Wallet(applicationSecret);
    if (wallet.address !== applicationId) {
      throw new InvalidParamError(`Invalid applicationId and applicationSecret passed to the constructor.`);
    }
  }
  catch (error) {
    throw new InvalidParamError(`Invalid applicationId and applicationSecret passed to the constructor.`);
  }
}

/* Transform Proof */
export async function transformProof(proof: ClaimTunnelResponse): Promise<Proof> {
  if (!proof || !proof.claim || !proof.signatures) {
    throw new InvalidParamError("Invalid proof object");
  }

  const attestorUrl = await getAttestorUrl();

  return {
    claimData: proof.claim,
    identifier: proof.claim.identifier,
    signatures: [
      "0x" + Buffer.from(proof.signatures.claimSignature).toString("hex"),
    ],
    extractedParameterValues: proof?.claim?.context ? JSON?.parse(proof?.claim?.context)?.extractedParameters : '',
    witnesses: [
      {
        id: proof?.signatures?.attestorAddress,
        url: attestorUrl,
      },
    ],
  };
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

/**
 * Auto-detects if a string is a regex pattern
 * Detects patterns with regex-specific syntax: anchors, escape sequences, character classes, quantifiers, groups
 */
export function isRegexPattern(pattern: string): boolean {
  return (
    pattern.startsWith('^') ||
    (pattern.endsWith('$') && !pattern.includes('://')) ||
    /\\[dDwWsS]|\[([^\]])+\]|\{\d+,?\d*\}|(\([^)]*\).*(?:\?:|\|))/.test(pattern)
  );
}

/**
 * Checks if a URL is allowed by matching against allowed URL patterns
 *
 * Supports multiple pattern types (auto-detected):
 * - 'https://api.example.com/data' - exact match
 * - 'https://api.example.com/*' - wildcard match
 * - '^https://api\\.example\\.com/user/\\d+$' - regex pattern (auto-detected)
 *
 * @param url - The URL to check
 * @param allowedUrls - Array of allowed URL patterns
 * @returns true if URL is allowed
 */
export function isUrlAllowed(url: string, allowedUrls: string[]): boolean {
  // Security: Canonicalize URL to prevent path traversal attacks
  // This resolves .. segments and normalizes the URL
  let canonicalUrl: string;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
    canonicalUrl = parsedUrl.href;
  } catch {
    return false; // Invalid URL format
  }

  for (const allowedUrl of allowedUrls) {
    // Regex pattern match
    if (isRegexPattern(allowedUrl)) {
      try {
        if (new RegExp(allowedUrl).test(canonicalUrl)) {
          return true;
        }
      } catch {
        // Invalid regex, skip
      }
      continue;
    }

    // Exact match
    if (canonicalUrl === allowedUrl) {
      return true;
    }

    // Wildcard match: handle both /* and * suffixes
    if (allowedUrl.endsWith('*')) {
      const baseUrl = allowedUrl.endsWith('/*')
        ? allowedUrl.slice(0, -2)
        : allowedUrl.slice(0, -1);

      // Security: Parse base URL to validate hostname boundaries
      // This prevents subdomain attacks like api.example.com.evil.com
      try {
        const parsedBase = new URL(baseUrl);

        // Verify scheme matches (http vs https)
        if (parsedUrl.protocol !== parsedBase.protocol) {
          continue;
        }

        // Verify hostname matches exactly (prevents subdomain bypass)
        if (parsedUrl.hostname !== parsedBase.hostname) {
          continue;
        }

        // Verify port matches (prevents port-based bypass)
        if (parsedUrl.port !== parsedBase.port) {
          continue;
        }

        // Verify path starts with base path (now safe after hostname check)
        if (parsedUrl.pathname.startsWith(parsedBase.pathname)) {
          return true;
        }
      } catch {
        // If base URL is invalid, fall back to simple string matching
        // for backward compatibility with edge cases
        if (canonicalUrl.startsWith(baseUrl)) {
          return true;
        }
      }
    }
  }

  return false;
}


// cache for app name to avoid multiple fetches 
const appNameCache: { [key: string]: string } = {};

export async function fetchAppById(appId: string): Promise<string> {
  if (appNameCache[appId]) {
    return appNameCache[appId];
  }
  try {
    // Deprecated: zkfetch applications migrated to applications
    // const response = await fetch(`${APP_BACKEND_URL}/api/zkfetch/sdk/${appId}`);
    const response = await fetch(`${APP_BACKEND_URL}/api/applications/sdk/get-zk-enabled-app/${appId}`);
    if (response.status === 404) {
      throw new ApplicationError('Application not found');
    }
    if (response.status !== 200) {
      throw new ApplicationError('Failed to fetch application');
    }

    const res = await response.json();
    const appName = res.application.name;
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
