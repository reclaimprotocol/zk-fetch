import { getTodo, getTodoPlain, getTodoSnarkjs } from './fetchTodo';
import { TODO_TITLE } from './modes';
import { expect, test, describe } from 'vitest'

describe('Legacy zkFetch (todo endpoint)', () => {
  test('should return valid context data', async () => {
    const proof = await getTodo();
    const context = JSON.parse(proof?.claimData?.context || "{}");

    expect(context).toBeDefined();
    expect(context.contextAddress).toContain("0x0000000000000000000000000000000000000000");
    expect(context.contextMessage).toBe("todo");
  }, 100000);

  test('should return the title as an OPRF hash', async () => {
    const proof = await getTodo();
    const titleHash = proof?.extractedParameterValues?.title;

    expect(proof?.extractedParameterValues).toBeDefined();
    expect(typeof titleHash).toBe('string');
    expect(titleHash.length).toBeGreaterThan(0);
    expect(titleHash).not.toBe(TODO_TITLE);
  }, 100000);

  test('should return the plain title (no OPRF)', async () => {
    const proof = await getTodoPlain();

    expect(proof?.extractedParameterValues?.title).toBe(TODO_TITLE);
  }, 100000);

  test('should return the title with snarkjs engine', async () => {
    const proof = await getTodoSnarkjs();

    expect(proof?.extractedParameterValues?.title).toBe(TODO_TITLE);
  }, 100000);
});
