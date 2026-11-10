import { describe, test, expect } from 'vitest'
import { isRegexPattern } from '../src/utils'

// The previous implementation, kept here as the reference behaviour.
const legacyIsRegexPattern = (pattern: string) =>
  pattern.startsWith('^') ||
  (pattern.endsWith('$') && !pattern.includes('://')) ||
  /\\[dDwWsS]|\[([^\]])+\]|\{\d+,?\d*\}|(\([^)]*\).*(?:\?:|\|))/.test(pattern)

describe('isRegexPattern', () => {
  test.each([
    ['https://api.example.com/data', false],
    ['https://api.example.com/*', false],
    ['^https://api\\.example\\.com/items/\\d+$', true],
    ['https://example.com/items/\\d+', true],
    ['https://example.com/[a-z]+', true],
    ['https://example.com/[]', false],
    ['https://example.com/a{2,3}', true],
    ['https://example.com/a{2}', true],
    ['https://example.com/a{2,}', true],
    ['https://example.com/a{,3}', false],
    ['https://example.com/{{2}', true],
    // Existing behaviour: `|` / `?:` only count after a group closes.
    ['https://example.com/(a|b)', false],
    ['https://example.com/(a)|b', true],
    // A later group after a line break still counts.
    ['(ignored)\n(https://allowed.example/path)|https://other', true],
    ['(a)\n|b', false],
    ['(a\nb)|c', true],
    ['https://example.com/(?:a)b|c', true],
    ['https://example.com/(a)', false],
  ])('%s -> %s', (pattern, expected) => {
    expect(isRegexPattern(pattern)).toBe(expected)
    expect(legacyIsRegexPattern(pattern)).toBe(expected)
  })

  test('matches the previous implementation on random inputs', () => {
    const alphabet = ['[', ']', '(', ')', '(', ')', '{', '}', '?', ':', '|', '\\', 'd', 'w', '1', ',', 'a', '/', '.', '$', '^', '\n', '\r', '\u2028']
    // mulberry32: a small seeded PRNG, so failures are reproducible.
    let seed = 42
    const rand = (n: number) => {
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n)
    }
    for (let i = 0; i < 200000; i++) {
      let s = ''
      const len = rand(40)
      for (let j = 0; j < len; j++) s += alphabet[rand(alphabet.length)]
      expect(isRegexPattern(s), JSON.stringify(s)).toBe(legacyIsRegexPattern(s))
    }
  })

  test('runs in linear time on adversarial input (no ReDoS)', () => {
    const n = 200_000
    const inputs = ['\\['.repeat(n), '['.repeat(n), '('.repeat(n) + ')' + 'x'.repeat(n), '{{' + '9'.repeat(n), '{1,'.repeat(n), '()\n'.repeat(n), '(\n)'.repeat(n)]
    const start = performance.now()
    for (const s of inputs) isRegexPattern(s)
    expect(performance.now() - start).toBeLessThan(200)
  })
})
