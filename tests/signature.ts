import { generateSessionSignature, ReclaimClient, verifySessionSignature } from '../src'
import { isUrlAllowed } from '../src/utils'
import { InvalidParamError } from '../src/errors'
import { config } from 'dotenv'
config()

/**
 * Test helper: Validates signature with expected application ID
 */
function validateSignatureAPI(signature: string, expectedApplicationId: string) {
  const signatureData = verifySessionSignature(signature);

  if (signatureData.applicationId.toLowerCase() !== expectedApplicationId.toLowerCase()) {
    throw new InvalidParamError(
      `Signature applicationId (${signatureData.applicationId}) does not match expected (${expectedApplicationId})`
    );
  }

  return {
    valid: true,
    applicationId: signatureData.applicationId,
    allowedUrls: signatureData.allowedUrls,
    expiresAt: signatureData.expiresAt
  };
}

/**
 * Helper: Generate a test signature with URL whitelist
 */
export const generateTestSignature = async () => {
  const signature = await generateSessionSignature({
    applicationId: process.env.APP_ID!,
    applicationSecret: process.env.APP_SECRET!,
    // A single anchored, escaped regex. Exact and wildcard entries are
    // covered by the URL Pattern Matching tests (testUrlPatterns).
    allowedUrls: [
      '^https://jsonplaceholder\\.typicode\\.com/todos/\\d+$'
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
    signature
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
      value: '"title": "(?<title>[^"]*)"',
    }],
    responseRedactions: [],
  }

  const proof = await client.zkFetch(
    'https://jsonplaceholder.typicode.com/todos/1',
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
