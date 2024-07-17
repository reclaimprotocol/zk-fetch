import { getEthPrice } from './getEthPrice';

test('getEthPrice', async () => {
    const ethPriceProof = await getEthPrice();
    expect(ethPriceProof).not.toBe(null)
}, 100000);