import { ReclaimClient } from '../src'


export const getEthPrice = async () => {
    // note this is test applicationId and applicationSecret and should be replaced with your own from (https://dev.reclaimprotocol.org/)
    const reclaim = new ReclaimClient("0xF218B59D7794e32693f5D3236e011C233E249105", "0xe7cc556f58d92618e04ebbd16744be753eb4d06d569590df341c89e25f6ecc9c", true)
    const options = {
        method: "GET",
        headers: {
            'Content-Type': 'application/json',
        }
    }
    const url = "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd";
    return await reclaim.zkFetch(url, options)
}