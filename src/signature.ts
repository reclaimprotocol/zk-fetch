import { ethers } from 'ethers';
import { InvalidParamError } from './errors';
import { validateApplicationIdAndSecret, validateAppRegistration, isRegexPattern, sendLogs } from './utils';
import { SignatureConfig, SignatureData } from './interfaces';
import { DEFAULT_EXPIRY_HOURS, MAX_EXPIRY_HOURS } from './constants';
import { LogType } from './types';
import { v4 } from 'uuid';




/**
 * Generates a signed token for frontend use
 *
 * @param config - Configuration object
 * @returns Signed token string
 */
export async function generateSessionSignature(config: SignatureConfig): Promise<string> {
  const { applicationId, applicationSecret, allowedUrls, expiresAt } = config;

  // Validate applicationId and applicationSecret
  validateApplicationIdAndSecret(applicationId, applicationSecret);

  // Validate that the application is registered
  await validateAppRegistration(applicationId);

  // Validate allowedUrls
  if (!Array.isArray(allowedUrls) || allowedUrls.length === 0) {
    throw new InvalidParamError('allowedUrls must be a non-empty array');
  }

  // Validate all URLs
  for (const url of allowedUrls) {
    if (typeof url !== 'string' || url.trim() === '') {
      throw new InvalidParamError('All URLs in allowedUrls must be non-empty strings');
    }

    // Check if it's a regex pattern and validate it
    if (isRegexPattern(url)) {
      try {
        new RegExp(url);
        continue;
      } catch (error) {
        throw new InvalidParamError(`Invalid regex pattern: ${url}`);
      }
    }

    // Validate URL format (allow wildcards)
    try {
      new URL(url.replace(/\/?\*$/, ''));
    } catch {
      throw new InvalidParamError(`Invalid URL format: ${url}`);
    }
  }

  // Set default expiration if not provided (1 hour from now)
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const finalExpiresAt = expiresAt || nowInSeconds + (DEFAULT_EXPIRY_HOURS * 3600);

  // Validate expiration time bounds
  if (finalExpiresAt <= nowInSeconds) {
    throw new InvalidParamError('expiresAt must be in the future');
  }

  const maxExpiresAt = nowInSeconds + (MAX_EXPIRY_HOURS * 3600);
  if (finalExpiresAt > maxExpiresAt) {
    throw new InvalidParamError(`expiresAt cannot exceed ${MAX_EXPIRY_HOURS} hours from now`);
  }

  // Generate unique signature ID for tracking
  const signatureId = v4().toString();

  const wallet = new ethers.Wallet(applicationSecret);

  const payload: SignatureData = {
    signatureId,
    applicationId,
    allowedUrls,
    expiresAt: finalExpiresAt,
  };

  // Convert payload to string and sign it
  const payloadString = JSON.stringify(payload);
  const messageHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(payloadString));
  const sig = await wallet.signMessage(ethers.utils.arrayify(messageHash));

  // Log signature generation
  await sendLogs({
    sessionId: signatureId,
    logType: LogType.SESSION_TOKEN_GENERATED,
    applicationId,
  });

  // Encode: base64(payload).signature
  const encodedPayload = Buffer.from(payloadString).toString('base64');

  return `${encodedPayload}.${sig}`;
}

/**
 * Verifies and decodes a session signature token
 *
 * @param signature - The signature token to verify
 * @returns Decoded signature data
 * @throws {InvalidParamError} If signature is invalid or expired
 */
export function verifySessionSignature(signature: string): SignatureData {
  if (!signature || typeof signature !== 'string') {
    throw new InvalidParamError('signature must be a non-empty string');
  }

  const parts = signature.split('.');
  if (parts.length !== 2) {
    throw new InvalidParamError('Invalid signature format');
  }

  const [encodedPayload, sig] = parts;

  // Decode payload
  let payload: SignatureData;
  try {
    const payloadString = Buffer.from(encodedPayload, 'base64').toString('utf-8');
    payload = JSON.parse(payloadString);
  } catch {
    throw new InvalidParamError('Invalid signature payload');
  }

  // Validate payload structure
  const requiredFields = ['signatureId', 'applicationId', 'allowedUrls', 'expiresAt'];
  if (!requiredFields.every(field => payload[field as keyof SignatureData]) || !Array.isArray(payload.allowedUrls)) {
    throw new InvalidParamError('Invalid signature payload structure');
  }

  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (payload.expiresAt <= now) {
    throw new InvalidParamError('Signature has expired');
  }

  // Verify signature
  try {
    const payloadString = JSON.stringify(payload);
    const messageHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(payloadString));
    const recoveredAddress = ethers.utils.verifyMessage(
      ethers.utils.arrayify(messageHash),
      sig
    );

    if (recoveredAddress.toLowerCase() !== payload.applicationId.toLowerCase()) {
      throw new InvalidParamError('Signature verification failed');
    }
  } catch {
    throw new InvalidParamError('Signature verification failed');
  }

  return payload;
}