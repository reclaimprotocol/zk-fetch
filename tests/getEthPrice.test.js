const { getEthPrice } = require('./getEthPrice');

test('getEthPrice', async () => {
    const ethPriceProof = await getEthPrice();
    const ethPrice = parseFloat(JSON.parse(ethPriceProof.claimData.parameters).responseMatches[0].value);
    console.log("ethPrice: ", ethPrice)

    expect(ethPrice).toEqual(expect.any(Number));
}, 100000);