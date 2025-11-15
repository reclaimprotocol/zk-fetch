import { ethers } from 'ethers';
import { InvalidParamError } from './errors';
import { validateApplicationIdAndSecret, isRegexPattern } from './utils';
import { SignatureConfig, SignatureData } from './interfaces';



const SIGNATURE_VERSION = '1.0'; // Signature version for future compatibility.
const DEFAULT_EXPIRY_HOURS = 1;
const MAX_EXPIRY_HOURS = 72;

/**
 * Generates a signed token for frontend use
 *
 * @param config - Configuration object
 * @returns Signed token string
 */
export async function generateSignature(config: SignatureConfig): Promise<string> {
  const { applicationId, applicationSecret, allowedUrls, expiresAt } = config;

  // Validate applicationId and applicationSecret
  validateApplicationIdAndSecret(applicationId, applicationSecret);

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

  // Generate a temporary private key for frontend use
  const wallet = new ethers.Wallet(applicationSecret);
  const tempWallet = ethers.Wallet.createRandom();
  const tempPrivateKey = tempWallet.privateKey;
  const tempAddress = tempWallet.address;

  // Create the payload
  const payload: SignatureData = {
    applicationId,
    allowedUrls,
    expiresAt: finalExpiresAt,
    version: SIGNATURE_VERSION,
    tempPrivateKey, // same will be used in the attestor ownerKey
    tempAddress,
  };

  // Convert payload to string and sign it
  const payloadString = JSON.stringify(payload);
  const messageHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(payloadString));
  const sig = await wallet.signMessage(ethers.utils.arrayify(messageHash));

  // Encode: base64(payload).signature
  const encodedPayload = Buffer.from(payloadString).toString('base64');

  return `${encodedPayload}.${sig}`;
}

/**
 * Verifies and decodes a signature token
 *
 * @param signature - The signature token to verify
 * @returns Decoded signature data
 * @throws {InvalidParamError} If signature is invalid or expired
 */
export function verifySignature(signature: string): SignatureData {
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
  const requiredFields = ['applicationId', 'allowedUrls', 'expiresAt', 'version', 'tempPrivateKey', 'tempAddress'];
  if (!requiredFields.every(field => payload[field as keyof SignatureData]) || !Array.isArray(payload.allowedUrls)) {
    throw new InvalidParamError('Invalid signature payload structure');
  }

  // Verify temp address matches temp private key
  try {
    const tempWallet = new ethers.Wallet(payload.tempPrivateKey);
    if (tempWallet.address.toLowerCase() !== payload.tempAddress.toLowerCase()) {
      throw new Error();
    }
  } catch {
    throw new InvalidParamError('Invalid temporary private key');
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