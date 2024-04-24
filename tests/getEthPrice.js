const { zkFetch } = require("../src");
module.exports.getEthPrice = async () => {
    const url = "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd";
    const options = {
        method: "GET",
    };
    return await zkFetch(url, options, {}, "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
}