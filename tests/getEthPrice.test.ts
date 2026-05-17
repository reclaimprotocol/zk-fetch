import { getEthPrice, getEthPricePlain, getEthPriceSnarkjs } from './getEthPrice';
import { expect, test, describe } from 'vitest'

describe('ETH Price Tests', () => {
  test('should return valid context data', async () => {
    const ethPriceProof = await getEthPrice();
    const context = JSON.parse(ethPriceProof?.claimData?.context || "{}");

    expect(context).toBeDefined();
    expect(context.contextAddress).toBeDefined();
    expect(context.contextAddress).toContain("0x0000000000000000000000000000000000000000");
    expect(context.contextMessage).toBeDefined();
    expect(context.contextMessage).toContain("eth_price");
  }, 100000);

  test('should return ETH price as OPRF hash', async () => {
    const ethPriceProof = await getEthPrice();
    const priceHash = ethPriceProof?.extractedParameterValues?.price;

    expect(ethPriceProof).toBeDefined();
    expect(ethPriceProof?.extractedParameterValues).toBeDefined();
    expect(typeof priceHash).toBe('string');
    expect(priceHash.length).toBeGreaterThan(0);
    expect(Number.isNaN(parseFloat(priceHash))).toBe(true);
  }, 100000);

  test('should return plain ETH price (no OPRF)', async () => {
    const ethPriceProof = await getEthPricePlain();
    const price = parseFloat(ethPriceProof?.extractedParameterValues?.price);

    expect(ethPriceProof).toBeDefined();
    expect(ethPriceProof?.extractedParameterValues).toBeDefined();
    expect(Number.isFinite(price)).toBe(true);
    expect(price).toBeGreaterThan(0);
  }, 100000);

  test('should return ETH price with snarkjs engine', async () => {
    const ethPriceProof = await getEthPriceSnarkjs();
    const price = parseFloat(ethPriceProof?.extractedParameterValues?.price);

    expect(ethPriceProof).toBeDefined();
    expect(ethPriceProof?.extractedParameterValues).toBeDefined();
    expect(Number.isFinite(price)).toBe(true);
    expect(price).toBeGreaterThan(0);
  }, 100000);
});