import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { ethers } from 'ethers'
import { createAuthRequest } from '@reclaimprotocol/attestor-core'
import type { ClaimTunnelResponse } from '@reclaimprotocol/attestor-core/lib/proto/api'
import { ReclaimClient, BuilderQuotaExceededError, BuilderAuthorizationError } from '../src'
import { decodeBuilderAuthorizationToken } from '../src/utils'

// Mock the attestor client so these tests never open a real WebSocket
// connection -- only Builder-mode's HTTP call to Builder and its handoff
// into `createClaimOnAttestor` are under test here.
vi.mock('@reclaimprotocol/attestor-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@reclaimprotocol/attestor-core')>()
  return {
    ...actual,
    createClaimOnAttestor: vi.fn(),
  }
})

const { createClaimOnAttestor } = await import('@reclaimprotocol/attestor-core')
const createClaimOnAttestorMock = vi.mocked(createClaimOnAttestor)

/**
 * Mirrors Builder's real token-minting code
 * (packages/agent/src/proof/attestor-auth.ts, `createAttestorAuthentication`):
 * base64(JSON.stringify({ data, signature: base64(signature bytes) })).
 */
async function mintBuilderToken(privateKey: string, id = 'test-session', expiresInS = 10) {
  const request = await createAuthRequest(
    { id, expiresAt: Math.floor(Date.now() / 1000) + expiresInS },
    privateKey
  )
  const token = Buffer.from(
    JSON.stringify({
      ...request,
      signature: Buffer.from(request.signature).toString('base64'),
    }),
    'utf8'
  ).toString('base64')
  return { request, token }
}

function fakeClaimTunnelResponse(): ClaimTunnelResponse {
  return {
    claim: {
      identifier: '0xidentifier',
      provider: 'http',
      parameters: '{}',
      owner: '0xowner',
      timestampS: 1700000000,
      context: JSON.stringify({ extractedParameters: { foo: 'bar' } }),
      epoch: 1,
    },
    signatures: {
      claimSignature: new Uint8Array([1, 2, 3, 4]),
      attestorAddress: '0xattestor',
      resultSignature: new Uint8Array(),
    },
  } as unknown as ClaimTunnelResponse
}

const ORG_TOKEN = 'rorg_test_token_123'
const BUILDER_BASE_URL = 'https://build.test.example'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  createClaimOnAttestorMock.mockReset()
  createClaimOnAttestorMock.mockResolvedValue(fakeClaimTunnelResponse())

  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/fetch/authorizations')) {
      throw new Error('fetchMock: no handler configured for /fetch/authorizations in this test')
    }
    throw new Error(`Unexpected HTTP request: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Builder mode construction', () => {
  test('accepts a Builder options object instead of an application id/secret', () => {
    const client = new ReclaimClient({ orgToken: ORG_TOKEN })
    expect(client).toBeInstanceOf(ReclaimClient)
  })

  test('rejects an empty orgToken', () => {
    expect(() => new ReclaimClient({ orgToken: '' })).toThrow('orgToken must be a non-empty string')
  })

  test('legacy applicationId/applicationSecret construction is unaffected', () => {
    expect(() => new ReclaimClient('', '0x'.padEnd(66, '1'))).toThrow(
      'applicationId must be a non-empty string'
    )
    expect(() => new ReclaimClient('0xabc', '')).toThrow(
      'applicationSecret must be a non-empty string'
    )
  })
})

describe('Builder-mode zkFetch: successful authorization flows into a proof attempt', () => {
  test('requests authorization for the target host, then hands the decoded token to the attestor client', async () => {
    const ownerWallet = ethers.Wallet.createRandom()
    const { request: mintedRequest, token } = await mintBuilderToken(ownerWallet.privateKey)

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/fetch/authorizations')) {
        expect(url).toBe(`${BUILDER_BASE_URL}/fetch/authorizations`)
        expect(init?.method).toBe('POST')
        expect((init?.headers as Record<string, string>)?.Authorization).toBe(`Bearer ${ORG_TOKEN}`)
        expect(JSON.parse(String(init?.body))).toEqual({ host: 'api.github.com' })
        return {
          ok: true,
          status: 200,
          json: async () => ({ token, expiresAt: new Date(Date.now() + 10_000).toISOString() }),
          text: async () => '',
        } as Response
      }
      throw new Error(`Unexpected HTTP request: ${url}`)
    })

    const client = new ReclaimClient({ orgToken: ORG_TOKEN, builderBaseUrl: BUILDER_BASE_URL })
    const proof = await client.zkFetch('https://api.github.com/user', { method: 'GET' })

    expect(proof.identifier).toBe('0xidentifier')
    expect(proof.witnesses[0].url).toBe('wss://attestor.reclaimprotocol.org/ws')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(createClaimOnAttestorMock).toHaveBeenCalledTimes(1)

    const callArgs = createClaimOnAttestorMock.mock.calls[0][0] as any
    // The private key used to own the claim must NOT be the org token, and
    // must be a usable ethers private key (Builder mode's ephemeral wallet).
    expect(callArgs.ownerPrivateKey).not.toBe(ORG_TOKEN)
    expect(() => new ethers.Wallet(callArgs.ownerPrivateKey)).not.toThrow()

    // The decoded auth request handed to the attestor client must match
    // what `createClaimOnAttestor`'s `client.authRequest` expects: a plain
    // `data` object plus a `Uint8Array` signature -- and must round-trip
    // back to exactly the bytes Builder signed.
    expect(callArgs.client.url).toBe('wss://attestor.reclaimprotocol.org/ws')
    expect(callArgs.client.authRequest.data).toEqual(mintedRequest.data)
    expect(callArgs.client.authRequest.signature).toBeInstanceOf(Uint8Array)
    expect(Buffer.from(callArgs.client.authRequest.signature).toString('hex')).toBe(
      Buffer.from(mintedRequest.signature).toString('hex')
    )
  })

  test('requests a fresh authorization per retry attempt rather than reusing one', async () => {
    const ownerWallet = ethers.Wallet.createRandom()
    let authCalls = 0

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/fetch/authorizations')) {
        authCalls++
        const { token } = await mintBuilderToken(ownerWallet.privateKey)
        return {
          ok: true,
          status: 200,
          json: async () => ({ token, expiresAt: new Date(Date.now() + 10_000).toISOString() }),
          text: async () => '',
        } as Response
      }
      return { ok: true, status: 200, json: async () => [], text: async () => '[]' } as Response
    })

    createClaimOnAttestorMock
      .mockRejectedValueOnce(new Error('transient attestor failure'))
      .mockResolvedValueOnce(fakeClaimTunnelResponse())

    const client = new ReclaimClient({ orgToken: ORG_TOKEN, builderBaseUrl: BUILDER_BASE_URL })
    const proof = await client.zkFetch('https://api.github.com/user', { method: 'GET' }, undefined, 2, 0)

    expect(proof.identifier).toBe('0xidentifier')
    expect(authCalls).toBe(2)
    expect(createClaimOnAttestorMock).toHaveBeenCalledTimes(2)
  })
})

describe('legacy zkFetch remains on the devtools path', () => {
  test('uses the legacy feature flag for both attestation and proof witnesses', async () => {
    const wallet = ethers.Wallet.createRandom()
    const legacyAttestorUrl = 'wss://legacy-attestor.example/ws'
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/applications/sdk/get-zk-enabled-app/')) {
        return { status: 200, json: async () => ({ application: { name: 'Legacy test' } }) } as Response
      }
      if (url.includes('/api/business-logs/zkfetch')) {
        return { ok: true } as Response
      }
      if (url.includes('/api/feature-flags/get?featureFlagNames=zkFetchAttestorURL')) {
        return {
          ok: true,
          json: async () => [{ name: 'zkFetchAttestorURL', value: legacyAttestorUrl }],
        } as Response
      }
      throw new Error(`Unexpected HTTP request: ${url}`)
    })

    const client = new ReclaimClient(wallet.address, wallet.privateKey)
    const proof = await client.zkFetch('https://api.github.com/user', { method: 'GET' })

    expect(proof.witnesses[0].url).toBe(legacyAttestorUrl)
    expect(createClaimOnAttestorMock.mock.calls[0][0].client?.url).toBe(legacyAttestorUrl)
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/feature-flags/get'))).toBe(true)
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes('/fetch/authorizations'))).toBe(true)
  })
})

describe('Builder-mode zkFetch: quota exhaustion', () => {
  test('a 429 from Builder surfaces as BuilderQuotaExceededError, distinguishable from a generic failure', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/fetch/authorizations')) {
        return { ok: false, status: 429, json: async () => ({}), text: async () => 'quota exhausted' } as Response
      }
      return { ok: true, status: 200, json: async () => [], text: async () => '[]' } as Response
    })

    const client = new ReclaimClient({ orgToken: ORG_TOKEN, builderBaseUrl: BUILDER_BASE_URL })

    let caught: unknown
    try {
      await client.zkFetch('https://api.github.com/user', { method: 'GET' })
      throw new Error('expected zkFetch to reject')
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(BuilderQuotaExceededError)
    expect(caught).toBeInstanceOf(BuilderAuthorizationError)
    expect((caught as BuilderQuotaExceededError).status).toBe(429)
    expect((caught as Error).name).toBe('BuilderQuotaExceededError')

    // Builder gates the call before any attestor/proof cost is spent.
    expect(createClaimOnAttestorMock).not.toHaveBeenCalled()
  })

  test('a 402 from Builder also surfaces as BuilderQuotaExceededError', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/fetch/authorizations')) {
        return { ok: false, status: 402, json: async () => ({}), text: async () => '' } as Response
      }
      return { ok: true, status: 200, json: async () => [], text: async () => '[]' } as Response
    })

    const client = new ReclaimClient({ orgToken: ORG_TOKEN, builderBaseUrl: BUILDER_BASE_URL })

    await expect(
      client.zkFetch('https://api.github.com/user', { method: 'GET' })
    ).rejects.toMatchObject({ name: 'BuilderQuotaExceededError', status: 402 })
  })

  test('a 401 from Builder surfaces as BuilderAuthorizationError, not BuilderQuotaExceededError', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/fetch/authorizations')) {
        return { ok: false, status: 401, json: async () => ({}), text: async () => '' } as Response
      }
      return { ok: true, status: 200, json: async () => [], text: async () => '[]' } as Response
    })

    const client = new ReclaimClient({ orgToken: 'rorg_bad', builderBaseUrl: BUILDER_BASE_URL })

    let caught: unknown
    try {
      await client.zkFetch('https://api.github.com/user', { method: 'GET' })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(BuilderAuthorizationError)
    expect(caught).not.toBeInstanceOf(BuilderQuotaExceededError)
    expect(createClaimOnAttestorMock).not.toHaveBeenCalled()
  })
})

describe('decodeBuilderAuthorizationToken: base64 -> object round-trip', () => {
  test('decodes the flat-base64-signature shape Builder actually produces', async () => {
    const wallet = ethers.Wallet.createRandom()
    const { request, token } = await mintBuilderToken(wallet.privateKey, 'session-a')

    const decoded = decodeBuilderAuthorizationToken(token)

    expect(decoded.data).toEqual(request.data)
    expect(decoded.signature).toBeInstanceOf(Uint8Array)
    expect(Buffer.from(decoded.signature).toString('hex')).toBe(
      Buffer.from(request.signature).toString('hex')
    )
  })

  test('also decodes the {type: "uint8array", value} wrapper shape, defensively', async () => {
    const wallet = ethers.Wallet.createRandom()
    const request = await createAuthRequest({ id: 'session-b' }, wallet.privateKey)

    const wrappedToken = Buffer.from(
      JSON.stringify({
        ...request,
        signature: { type: 'uint8array', value: Buffer.from(request.signature).toString('base64') },
      }),
      'utf8'
    ).toString('base64')

    const decoded = decodeBuilderAuthorizationToken(wrappedToken)

    expect(decoded.data).toEqual(request.data)
    expect(Buffer.from(decoded.signature).toString('hex')).toBe(
      Buffer.from(request.signature).toString('hex')
    )
  })

  test('rejects a token that is not valid base64/JSON', () => {
    expect(() => decodeBuilderAuthorizationToken('not-base64-json!!!')).toThrow()
  })

  test('rejects a token whose signature is not decodable to bytes', () => {
    const badToken = Buffer.from(
      JSON.stringify({ data: { id: 'x', createdAt: 0, expiresAt: 0, hostWhitelist: [] }, signature: 12345 }),
      'utf8'
    ).toString('base64')
    expect(() => decodeBuilderAuthorizationToken(badToken)).toThrow()
  })
})
