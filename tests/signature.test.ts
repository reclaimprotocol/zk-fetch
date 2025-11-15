import { expect, test, describe } from 'vitest'
import {
  generateTestSignature,
  zkFetchWithSignature,
  testUrlPatterns,
  testBackendValidation
} from './signature'
import { ReclaimClient } from '../src'
import { config } from 'dotenv'
config()

describe('Signature Generation', () => {
  test('should generate valid signature', async () => {
    const signature = await generateTestSignature()

    expect(signature).toBeDefined()
    expect(typeof signature).toBe('string')
    expect(signature).toContain('.') // Format: payload.signature

    const parts = signature.split('.')
    expect(parts).toHaveLength(2)
  }, 10000)

  test('should validate signature on backend', async () => {
    const signature = await generateTestSignature()
    const validation = await testBackendValidation(signature)

    expect(validation.valid).toBe(true)
    expect(validation.applicationId).toBe(process.env.APP_ID)
    expect(validation.allowedUrls).toBeDefined()
    expect(validation.allowedUrls.length).toBeGreaterThan(0)
    expect(validation.expiresAt).toBeGreaterThan(Date.now() / 1000)
    expect(validation.tempAddress).toBeDefined()
  }, 10000)
})

describe('Signature-Based zkFetch', () => {
  test('should fetch with valid signature', async () => {
    const signature = await generateTestSignature()
    const proof = await zkFetchWithSignature(signature)

    expect(proof).toBeDefined()
    expect(proof?.claimData).toBeDefined()
    expect(proof?.signatures).toBeDefined()
    expect(proof?.signatures?.length).toBeGreaterThan(0)
  }, 100000)

  test('should reject wrong application ID', async () => {
    const signature = await generateTestSignature()

    expect(() => {
      new ReclaimClient(
        '0xWrongApplicationId',
        { signature }
      )
    }).toThrow('Signature applicationId does not match')
  })

  test('should reject non-whitelisted URL', async () => {
    const signature = await generateTestSignature()
    const client = new ReclaimClient(
      process.env.APP_ID!,
      { signature }
    )

    await expect(async () => {
      await client.zkFetch(
        'https://evil.com/data',
        { method: 'GET' }
      )
    }).rejects.toThrow('not allowed by the signature')
  }, 10000)
})

describe('URL Pattern Matching', () => {
  test('should match exact URLs', () => {
    const results = testUrlPatterns()

    expect(results.exactMatch).toBe(true)
  })

  test('should match wildcard patterns', () => {
    const results = testUrlPatterns()

    expect(results.wildcardMatch).toBe(true)
  })

  test('should match regex patterns', () => {
    const results = testUrlPatterns()

    expect(results.regexMatch).toBe(true)
  })

  test('should reject non-matching URLs', () => {
    const results = testUrlPatterns()

    expect(results.noMatch).toBe(false)
  })
})

describe('App ID & Secret Authentication', () => {
  test('should work with applicationSecret', async () => {
    const client = new ReclaimClient(
      process.env.APP_ID!,
      process.env.APP_SECRET!
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

    expect(proof).toBeDefined()
    expect(proof?.claimData).toBeDefined()
  }, 100000)

  test('should work with new options format', async () => {
    const client = new ReclaimClient(
      process.env.APP_ID!,
      { applicationSecret: process.env.APP_SECRET! }
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

    expect(proof).toBeDefined()
    expect(proof?.claimData).toBeDefined()
  }, 100000)
})

describe('Error Handling', () => {
  test('should require either secret or signature', () => {
    expect(() => {
      new ReclaimClient(
        process.env.APP_ID!,
        {} as any // Neither secret nor signature
      )
    }).toThrow('Must provide either applicationSecret')
  })

  test('should reject both secret and signature', () => {
    expect(() => {
      new ReclaimClient(
        process.env.APP_ID!,
        {
          applicationSecret: process.env.APP_SECRET!,
          signature: 'some-signature'
        }
      )
    }).toThrow('Cannot provide both')
  })
})
