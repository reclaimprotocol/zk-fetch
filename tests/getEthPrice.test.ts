import { getEthPrice } from './getEthPrice';
import { expect, test } from 'vitest'

test('getEthPrice', async () => {
    const ethPriceProof = await getEthPrice();
    expect(parseFloat(ethPriceProof?.extractedParameterValues?.price)).toBeGreaterThan(0);
}, 100000);