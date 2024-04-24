const { getEthPrice } = require('./getEthPrice');

test('getEthPrice', async () => {
    const ethPrice = await getEthPrice();
    expect(ethPrice).toEqual({
        ethereum: {
            usd: expect.any(Number)
        }
    });
}, 50000);