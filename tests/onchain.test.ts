import { describe, test, expect } from 'vitest'
import { transformForOnchain, Proof } from '../src'

const proof: Proof = {
  identifier: '0xabc',
  claimData: {
    provider: 'http',
    parameters: '{"method":"GET","url":"https://example.com"}',
    owner: '0x1111111111111111111111111111111111111111',
    timestampS: 1700000000,
    context: '{"contextAddress":"0x0","contextMessage":"m"}',
    identifier: '0xabc',
    epoch: 1,
  },
  signatures: ['0xsig'],
  witnesses: [{ id: '0xwitness', url: 'wss://attestor.example/ws' }],
  extractedParameterValues: { title: 't' },
}

describe('transformForOnchain', () => {
  // Byte-for-byte the output of @reclaimprotocol/js-sdk's transformForOnchain
  // (key order included), so contract calls built from it don't change.
  test('matches the js-sdk on-chain shape exactly', () => {
    expect(JSON.stringify(transformForOnchain(proof))).toBe(
      JSON.stringify({
        claimInfo: {
          context: proof.claimData.context,
          parameters: proof.claimData.parameters,
          provider: 'http',
        },
        signedClaim: {
          claim: {
            epoch: 1,
            identifier: '0xabc',
            owner: '0x1111111111111111111111111111111111111111',
            timestampS: 1700000000,
          },
          signatures: ['0xsig'],
        },
      })
    )
  })

  test('leaves out fields the contracts do not take', () => {
    const onchain = transformForOnchain(proof) as unknown as Record<string, unknown>
    expect(onchain).not.toHaveProperty('witnesses')
    expect(onchain).not.toHaveProperty('extractedParameterValues')
  })
})
