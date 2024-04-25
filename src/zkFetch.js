var reclaimprotocol = require("@reclaimprotocol/witness-sdk");
var createClaim = reclaimprotocol.createClaim;
var getBeacon = reclaimprotocol.getBeacon;

var BeaconType = require("@reclaimprotocol/witness-sdk/lib/proto/api").BeaconType;

const P = require('pino');
const logger = P();
/*
  const response = await fetch(url, {
    method: "POST", // *GET, POST, PUT, DELETE, etc.
    mode: "cors", // no-cors, *cors, same-origin
    cache: "no-cache", // *default, no-cache, reload, force-cache, only-if-cached
    credentials: "same-origin", // include, *same-origin, omit
    headers: {
      "Content-Type": "application/json",
      // 'Content-Type': 'application/x-www-form-urlencoded',
    },
    redirect: "follow", // manual, *follow, error
    referrerPolicy: "no-referrer", // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
    body: JSON.stringify(data), // body data type must match "Content-Type" header
  });
  return response.json(); // parses JSON response into native JavaScript objects
*/

function assertCorrectnessOfOptions(options) {
    if (!options.method) {
        throw new Error("Method is required");
    }
    if (options.method != "GET" && options.method != "POST") {
        throw new Error("Allowed methods are GET and POST only");
    }
    if(options.mode || options.cache || options.credentials || options.redirect || options.referrerPolicy) {
        throw new Error("Only allowed `method` and `body` in options object");
    }

}

module.exports.zkFetch =  async function(url, options, secretHeaders, ecdsaPrivateKey) {
    assertCorrectnessOfOptions(options);

    //const regularFetchResponse = (await (await fetch(url, options)).json()).ethereum.usd.toString();
    const regularFetchResponse = (await (await fetch(url, options)).text());
    console.log(regularFetchResponse);
    const providerParams = {
        "method": options.method,
        "url": url,
        "responseMatches": [
            {
                "type": "contains",
                "value": regularFetchResponse
            }
        ],
        responseRedactions: [],
        body: options.body,
    };
    console.log(providerParams);
    const claim = await createClaim({
        "name": "http",
        "params": {
            "method": "GET",
            "url": "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
            "responseMatches": [
                {
                    "type": "contains",
                    "value": regularFetchResponse
                }
            ],
            "responseRedactions": []
        },
        "secretParams": {
            "headers": {
                "accept": "application/json, text/plain, */*"
            }
        },
/*		name: 'http',
		params: providerParams,
		secretParams: {
            cookieStr: "abc=pqr",
            ...options.headers,
			...secretHeaders
		},
*/
		ownerPrivateKey: ecdsaPrivateKey,
		logger,
		beacon: getBeacon({
			type: BeaconType.BEACON_TYPE_SMART_CONTRACT,
			id: '0x12c'
		})
	});
    console.log(claim);
}