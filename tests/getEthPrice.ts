// const { zkFetch, zkFetchWithRetries } = require("../src");
// const keys = require("./.keys.json");
// module.exports.getEthPrice = async () => {
//     const url = "https://pro-api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd";
//     const options = {
//         method: "GET",
//         headers: {
//             "accept": "application/json, text/plain, */*",
//         }
//     };
//     const secretOptions = {
//       headers : {
//         "x-cg-pro-api-key": keys.COINGECKO_API_KEY
//       }
//     }
//     return await zkFetch(url, options, secretOptions, "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
// }

import { ReclaimClient } from '../src'


export const getEthPrice = async () => {
    // note this is test applicationId and applicationSecret and should be replaced with your own
    const reclaim = new ReclaimClient("0xF218B59D7794e32693f5D3236e011C233E249105", "0xe7cc556f58d92618e04ebbd16744be753eb4d06d569590df341c89e25f6ecc9c")
    const options = {
        method: "GET",
        headers: {
            'Content-Type': 'application/json',
        }
    }
    const url = "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd";
    return await reclaim.zkFetch(url, options, {}, 2, 1000)
}