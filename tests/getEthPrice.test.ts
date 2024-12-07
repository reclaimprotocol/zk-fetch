import { getEthPrice } from './getEthPrice';
import { expect, test } from 'vitest'

test('extractedParameterValues', async () => {
    const ethPriceProof = await getEthPrice();
    expect(parseFloat(ethPriceProof?.extractedParameterValues?.price)).toBeGreaterThan(0);
}, 100000);


test('context', async () => {
    const ethPriceProof = await getEthPrice();
    const context = JSON.parse(ethPriceProof?.claimData?.context || "{}");
    expect(context?.contextAddress).toContain("0x0000000000000000000000000000000000000000");
    expect(context?.contextMessage).toContain("eth_price");
}, 100000);