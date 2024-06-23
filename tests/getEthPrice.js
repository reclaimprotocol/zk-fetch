const { zkFetch, zkFetchWithRetries } = require("../src");
const keys = require("./.keys.json");
module.exports.getEthPrice = async () => {
    const url = "https://pro-api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd";
    const options = {
        method: "GET",
        headers: {
            "accept": "application/json, text/plain, */*",
        }
    };
    const secretOptions = {
      headers : {
        "x-cg-pro-api-key": keys.COINGECKO_API_KEY
      }
    }
    return await zkFetch(url, options, secretOptions, "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
}


/*
    {
      identifier: '0x20c0b85824df72484ed436c967a3232d63044032aff9f0019dc87a61f4a65962',
      claimData: {
        provider: 'http',
        parameters: '{"method":"GET","responseMatches":[{"type":"contains","value":"{\\"ethereum\\":{\\"usd\\":3138.93}}"}],"responseRedactions":[],"url":"https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"}',
        owner: '0x1be31a94361a391bbafb2a4ccd704f57dc04d4bb',
        timestampS: 1714019651,
        context: '{"providerHash":"0x8597f754ee2ad6aa4e648aae1b29ba136c205f9166e10ad9dabcb1970995cba3"}',
        identifier: '0x20c0b85824df72484ed436c967a3232d63044032aff9f0019dc87a61f4a65962',
        epoch: 1
      },
      signatures: [
        '0xb5b654121eee97a334860029eddca3c4bacf7a05ff7dc2006c36aa7b690b6782731e2babf3c142ca6987150553f8c93cab18c0d349ba5737cbca5b0611238b7c1b'
      ],
      witnesses: [
        {
          id: '0x244897572368eadf65bfbc5aec98d8e5443a9072',
          url: 'https://reclaim-node.questbook.app'
        }
      ]
    }

*/
