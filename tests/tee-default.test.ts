import { describe, test, expect } from 'vitest'
import { resolveUseTee, teeRedactions } from '../src/tee-default'

const GET = { method: 'GET' }

describe('resolveUseTee: TEE is the default', () => {
  test('defaults to TEE when useTee is not set', () => {
    expect(resolveUseTee(GET, undefined, true)).toBe(true)
    expect(resolveUseTee(undefined, undefined, true)).toBe(true)
  })

  test('an explicit useTee always wins', () => {
    expect(resolveUseTee({ ...GET, useTee: false }, undefined, true)).toBe(false)
    expect(resolveUseTee({ ...GET, useTee: true, zkEngine: 'snarkjs' }, undefined, true)).toBe(true)
    expect(resolveUseTee({ ...GET, useTee: true }, { responseRedactions: [{ regex: 'x', hash: 'oprf-raw' }] }, true)).toBe(true)
    // Even where no TEE library is published: the TEE path then reports why it can't run.
    expect(resolveUseTee({ ...GET, useTee: true }, undefined, false)).toBe(true)
  })

  test('stays on the non-TEE path when zkEngine is set', () => {
    expect(resolveUseTee({ ...GET, zkEngine: 'stwo' }, undefined, true)).toBe(false)
    expect(resolveUseTee({ ...GET, zkEngine: 'snarkjs' }, undefined, true)).toBe(false)
  })

  test("stays on the non-TEE path for an 'oprf-raw' redaction hash", () => {
    const secret = { responseRedactions: [{ regex: 'a' }, { regex: 'b', hash: 'oprf-raw' as const }] }
    expect(resolveUseTee(GET, secret, true)).toBe(false)
  })

  test("keeps TEE for the TEE-only 'oprf-mpc' hash", () => {
    expect(resolveUseTee(GET, { responseRedactions: [{ regex: 'a', hash: 'oprf-mpc' }] }, true)).toBe(true)
  })

  test('stays on the non-TEE path where no TEE library is published', () => {
    expect(resolveUseTee(GET, undefined, false)).toBe(false)
  })
})

describe("teeRedactions: deprecated 'oprf' hash", () => {
  test("sends 'oprf' to the TEE as 'oprf-mpc' and leaves other redactions unchanged", () => {
    expect(teeRedactions([
      { regex: 'a', hash: 'oprf' },
      { regex: 'b', hash: 'oprf-mpc' },
      { jsonPath: '$.c' },
    ])).toEqual([
      { regex: 'a', hash: 'oprf-mpc' },
      { regex: 'b', hash: 'oprf-mpc' },
      { jsonPath: '$.c' },
    ])
  })

  test('treats missing redactions as none', () => {
    expect(teeRedactions(undefined)).toEqual([])
  })

  test("keeps an 'oprf' request on the TEE path", () => {
    expect(resolveUseTee(GET, { responseRedactions: [{ regex: 'a', hash: 'oprf' }] }, true)).toBe(true)
  })
})
