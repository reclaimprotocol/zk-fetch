import { generateSignature, ReclaimClient, verifySignature } from '../src'
import { isUrlAllowed } from '../src/utils'
import { InvalidParamError } from '../src/errors'
import { config } from 'dotenv'
config()

/**
 * Test helper: Validates signature with expected application ID
 */
function validateSignatureAPI(signature: string, expectedApplicationId: string) {
  const signatureData = verifySignature(signature);

  if (signatureData.applicationId.toLowerCase() !== expectedApplicationId.toLowerCase()) {
    throw new InvalidParamError(
      `Signature applicationId (${signatureData.applicationId}) does not match expected (${expectedApplicationId})`
    );
  }

  return {
    valid: true,
    applicationId: signatureData.applicationId,
    allowedUrls: signatureData.allowedUrls,
    expiresAt: signatureData.expiresAt,
    tempAddress: signatureData.tempAddress,
  };
}

/**
 * Helper: Generate a test signature with URL whitelist
 */
export const generateTestSignature = async () => {
  const signature = await generateSignature({
    applicationId: process.env.APP_ID!,
    applicationSecret: process.env.APP_SECRET!,
    allowedUrls: [
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
      'https://api.coingecko.com/*',
      '^https://api\\.coingecko\\.com/api/v\\d+/.*$'
    ],
    expiresAt: Math.floor(Date.now() / 1000) + 3600 // 1 hour
  })

  return signature
}

/**
 * Helper: Test zkFetch with signature
 */
export const zkFetchWithSignature = async (signature: string) => {
  const client = new ReclaimClient(
    process.env.APP_ID!,
    { signature }
  )

  const options = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    }
  }

  const privateOptions = {
    responseMatches: [{
      type: 'regex' as const,
      value: 'ethereum":{"usd":(?<price>.*?)}}',
    }],
    responseRedactions: [{ regex: 'ethereum":{"usd":(?<price>.*?)}}'}],
  }

  const proof = await client.zkFetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
    options,
    privateOptions
  )

  return proof
}

/**
 * Helper: Test URL pattern matching
 */
export const testUrlPatterns = () => {
  const allowedUrls = [
    'https://api.example.com/data',
    'https://api.example.com/*',
    '^https://api\\.example\\.com/items/\\d+$'
  ]

  return {
    exactMatch: isUrlAllowed('https://api.example.com/data', allowedUrls),
    wildcardMatch: isUrlAllowed('https://api.example.com/users/123', allowedUrls),
    regexMatch: isUrlAllowed('https://api.example.com/items/456', allowedUrls),
    noMatch: isUrlAllowed('https://evil.com/data', allowedUrls)
  }
}

/**
 * Helper: Test backend validation
 */
export const testBackendValidation = async (signature: string) => {
  const result = validateSignatureAPI(
    signature,
    process.env.APP_ID as string
  )

  return result
}
