import { getEthPrice } from './getEthPrice';
import { expect, test } from 'vitest'

test('getEthPrice', async () => {
    const ethPriceProof = await getEthPrice();
    expect(ethPriceProof?.claim?.context).toBeDefined()

}, 100000);