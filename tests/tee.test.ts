import { getEthPriceWithTee } from './tee';
import { expect, test, describe } from 'vitest'

describe('TEE ETH Price Tests', () => {
  test('should return valid context data', async () => {
    const ethPriceProof = await getEthPriceWithTee();
    const context = JSON.parse(ethPriceProof?.claimData?.context || "{}");

    expect(context).toBeDefined();
    expect(context.contextAddress).toBeDefined();
    expect(context.contextAddress).toBe("0x0000000000000000000000000000000000000000");
    expect(context.contextMessage).toBeDefined();
    expect(context.contextMessage).toContain("eth_price_tee");
  }, 100000);

  test('should return ETH price', async () => {
    const ethPriceProof = await getEthPriceWithTee();

    expect(ethPriceProof).toBeDefined();
    expect(ethPriceProof?.extractedParameterValues).toBeDefined();
    expect(ethPriceProof?.extractedParameterValues?.price).toBeDefined();

    const price = parseFloat(ethPriceProof?.extractedParameterValues?.price);
    expect(Number.isFinite(price)).toBe(true);
    expect(price).toBeGreaterThan(0);
  }, 100000);
});
