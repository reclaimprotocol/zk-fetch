const { getEthPrice } = require('./getEthPrice');

test('getEthPrice', async () => {
    const ethPriceProof = await getEthPrice();
    console.log(ethPriceProof)
    console.log("ethPriceProof: ", JSON.parse(JSON.parse(ethPriceProof.claimData.parameters).responseMatches[0].value).ethereum.usd)
    const ethPrice = JSON.parse(JSON.parse(ethPriceProof.claimData.parameters).responseMatches[0].value).ethereum.usd;
    console.log("ethPrice: ", ethPrice)

    expect(ethPrice).toEqual(expect.any(Number));
}, 100000);