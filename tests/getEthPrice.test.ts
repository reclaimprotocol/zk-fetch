import { getEthPrice } from './getEthPrice';
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

  test('should return ETH price', async () => {
    const ethPriceProof = await getEthPrice();
    const price = parseFloat(ethPriceProof?.extractedParameterValues?.price);
    
    expect(ethPriceProof).toBeDefined();
    expect(ethPriceProof?.extractedParameterValues).toBeDefined();
    expect(price).toBeDefined();
    expect(price).toBeGreaterThan(0);
  }, 100000);
});