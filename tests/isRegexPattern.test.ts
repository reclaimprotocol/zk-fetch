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
    // Existing behaviour: `|` / `?:` only count after a group closes.
    ['https://example.com/(a|b)', false],
    ['https://example.com/(a)|b', true],
    ['https://example.com/(?:a)b|c', true],
    ['https://example.com/(a)', false],
  ])('%s -> %s', (pattern, expected) => {
    expect(isRegexPattern(pattern)).toBe(expected)
    expect(legacyIsRegexPattern(pattern)).toBe(expected)
  })

  test('matches the previous implementation on random inputs', () => {
    const alphabet = ['[', ']', '(', ')', '{', '}', '?', ':', '|', '\\', 'd', 'w', '1', ',', 'a', '/', '.', '$', '^', '\n']
    let seed = 42
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed % n
    }
    for (let i = 0; i < 50000; i++) {
      let s = ''
      const len = rand(14)
      for (let j = 0; j < len; j++) s += alphabet[rand(alphabet.length)]
      expect(isRegexPattern(s), JSON.stringify(s)).toBe(legacyIsRegexPattern(s))
    }
  })

  test('runs in linear time on adversarial input (no ReDoS)', () => {
    const n = 200_000
    const inputs = ['\\['.repeat(n), '['.repeat(n), '('.repeat(n) + ')' + 'x'.repeat(n)]
    const start = performance.now()
    for (const s of inputs) isRegexPattern(s)
    expect(performance.now() - start).toBeLessThan(200)
  })
})
