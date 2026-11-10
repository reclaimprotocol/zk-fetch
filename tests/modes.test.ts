import { expect, test, describe } from 'vitest'
import { BuilderAuthorizationError, BuilderQuotaExceededError } from '../src'
import {
  createBuilderClient,
  createLegacyClient,
  getTodoWith,
  hasBuilderCredentials,
  hasLegacyCredentials,
  TODO_TITLE,
} from './modes'

// Live end-to-end checks of both authentication modes against the real
// backends and attestor. Each block is skipped when its credentials are
// missing from the environment (see .env.example).

const expectValidProof = (
  proof: Awaited<ReturnType<typeof getTodoWith>>,
  contextMessage: string
) => {
  expect(proof).toBeDefined()
  expect(proof?.extractedParameterValues?.title).toBe(TODO_TITLE)

  const context = JSON.parse(proof?.claimData?.context || '{}')
  expect(context.contextMessage).toBe(contextMessage)
  expect(proof?.signatures?.length).toBeGreaterThan(0)
  expect(proof?.witnesses?.length).toBeGreaterThan(0)
}

describe.skipIf(!hasLegacyCredentials)('Legacy mode (APP_ID / APP_SECRET), live', () => {
  test('produces a valid proof', async () => {
    const proof = await getTodoWith(createLegacyClient(), 'legacy')
    expectValidProof(proof, 'legacy')
  }, 120000)
})

describe.skipIf(!hasBuilderCredentials)('Builder mode (org token), live', () => {
  test('produces a valid proof', async () => {
    const proof = await getTodoWith(createBuilderClient(), 'builder')
    expectValidProof(proof, 'builder')
  }, 120000)

  test('one client can make consecutive calls (a new authorization each time)', async () => {
    const client = createBuilderClient()
    const first = await getTodoWith(client, 'builder_1')
    const second = await getTodoWith(client, 'builder_2')
    expectValidProof(first, 'builder_1')
    expectValidProof(second, 'builder_2')
  }, 240000)

  test('rejects an invalid org token with BuilderAuthorizationError (not a quota error)', async () => {
    const error = await getTodoWith(createBuilderClient('rorg_invalid_token'), 'builder_bad', 1)
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(BuilderAuthorizationError)
    expect(error).not.toBeInstanceOf(BuilderQuotaExceededError)
  }, 60000)
})
