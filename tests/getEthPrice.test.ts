import { getEthPrice } from './getEthPrice';

test('getEthPrice', async () => {
    const ethPriceProof = await getEthPrice();
    if(ethPriceProof === undefined) {
        console.log("ethPriceProof is undefined")
        return
    }
    const ethPrice = JSON.parse(JSON.parse(ethPriceProof.claimData.parameters).responseMatches[0].value).ethereum.usd;

    expect(ethPrice).toEqual(expect.any(Number));
}, 100000);