# zkFetch.js
_fetch, but with a zkproof_

## Overview
This library lets you fetch any remote resource over an https endpoint. Along with the response, you also get a proof of correct execution of the fetch that can be verified by a third party.

For example, if you do a fetch with a private api key that the third party doesn't have access to, how do you prove to them that you executed the fetch correctly using the api key, and not sharing with them an arbitrary or tampered response? zkfetch.

Key features:
- Generate verifiable proofs of HTTP requests
- Support for private credentials (API keys, auth headers) and secret params
- Response matching and redaction
- Built on [Reclaim Protocol](https://reclaimprotocol.org)

**Note:** For optimal proof generation, use zkFetch with relatively stable data that doesn't change frequently (within ~5s).

## Installation

```bash
# Install the package
npm install @reclaimprotocol/zk-fetch

# Download required ZK proof files
node node_modules/@reclaimprotocol/zk-symmetric-crypto/lib/scripts/download-files
```

## Prerequisites

- Node.js version 18 or higher
- An application ID and secret from the [Reclaim Developer Portal](https://dev.reclaimprotocol.org/)


## Quick Start

```javascript
const { ReclaimClient } = require("@reclaimprotocol/zk-fetch");

// Initialize client
const client = new ReclaimClient('APPLICATION_ID', 'APPLICATION_SECRET');

// Make a verified request
const proof = await client.zkFetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd', {
  method: 'GET',
  headers: {
    accept: 'application/json'
  }
}, {
  responseMatches: [{
    type: 'regex',
    value: 'ethereum":{"usd":(?<price>.*?)}}',
  }],
  responseRedactions: [{ regex: 'ethereum":{"usd":(?<price>.*?)}}'}],  
});
```


## Usage

### For public endpoints
If the endpoint you want to _fetch_ and generate a proof of the response. This endpoint is public, and doesn't need any private data like auth headers/api keys.

This is useful when
- Verifier needs to verify without re-doing the api call
- The API doesn't need any private headers or auth
- The proof or response needs to be generated for a particular endpoint now, and verified later

```
  const publicOptions = {
    method: 'GET', // or POST or PUT
    headers : {
        accept: 'application/json, text/plain, */*' 
    }
  }
  const proof = await client.zkFetch(
    'https://your.url.org',
    publicOptions
  )
```

Note : all the data in the publicOptions will be visible to them who you share the proof with (aka, verifier).

### For private endpoint
If you want to _fetch_ and generate a proof of the response, but the fetch involves some private data like auth headers or api keys 

This is useful when 
- Using API keys
- Using Auth headers

```
  const publicOptions = {
    method: 'GET', // or POST
    headers : {
      accept: 'application/json, text/plain, */*' 
    }
  }

  const privateOptions = {
    headers {
        apiKey: "123...456",
        someOtherHeader: "someOtherValue",
    }
  }

  const proof = await client.zkFetch(
    'https://your.url.org',
    publicOptions,
    privateOptions
  )

```

All the data in the privateOptions will stay hidden to the verifier.

### Using Secret Params

You can add secret params to the request. This won't be revealed in the proof and hidden from the verifier.

For example, here's how you can make a POST request with a body containing a JSON object that includes a secret value
```
  const publicOptions = {
    method: 'POST',
    body: JSON.stringify({
      'param1': '{{value}}'
    })
  }

  const privateOptions = {
    paramValues: {
      'value': 'secret_value'
    }
  }

  const proof = await client.zkFetch(
    'https://your.url.org',
    publicOptions,
    privateOptions
  )
```

This will replace the '{{value}}' in the body with 'secret_value' and send the request to the server. but the secret_value will remain hidden from the verifier and will not be revealed in the proof.

### Using CookieStr 

You can add cookieStr to the request. This won't be revealed in the proof and hidden from the verifier.

```
  const privateOptions = {
    cookieStr: 'cookie_value'
  }
```


### Using Response Matches and Redactions

You can also use responseMatches and responseRedactions to match and redact the response. This is useful when you want to verify the response against a particular value or redact some part of the response.

```
 const publicOptions = {
    method: 'GET', // or POST
    headers : {
      accept: 'application/json, text/plain, */*' 
    }
  }

  const privateOptions = {
    responseMatches: [
      {
        type: 'contains' | 'regex', // type of match 
        value: '<HTTP RESPONSE TEXT>' | '<REGEX>', // value to match or regex to match 
      }
    ],
    responseRedactions: [
      {
        jsonPath: '$.data', // JSON path to redact 
        xPath: '/data', // Xpath to redact  
        regex: '<REGEX>', // Regex to redact
      }
    ]
  }

  const proof = await client.zkFetch(
    'https://your.url.org',
    publicOptions,
    privateOptions
  )
```

### Using Context

You can add context to your proof request, which can be useful for providing additional information:

```
  const publicOptions = {
    context: {
      contextAddress: '0x0000000000000000000000000000000000000000',
      contextMessage: 'message'
    }
  }
```


## Using the response

The response looks like the follows
```
{
  claimData: {
    provider: 'http',
    parameters: '{"body":"","method":"GET","responseMatches":[{"type":"regex","value":"ethereum\\":{\\"usd\\":(?<price>.*?)}}"}],"responseRedactions":[],"url":"https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"}',
    owner: '0x96faf173bb7171a530b3e44f35f32d1307bda4fa',
    timestampS: 1725377559,
    context: '{"contextAddress":"0x0000000000000000000000000000000000000000","contextMessage":"message","extractedParameters":{"price":"2446.75"},"providerHash":"0xe5a9592ed030d011f1755f392c07aea1f3cb0492ad8910254b25f80ad556e3bb"}',
    identifier: '0x8518b246857a47658edc8314319305c1fb5eb666ec3ee36ae07e1564c73ff288',
    epoch: 1
  },
  identifier: '0x8518b246857a47658edc8314319305c1fb5eb666ec3ee36ae07e1564c73ff288',
  signatures: [
    '0x02d14b5f3377875ecab84125e53c2387b7b1a50b4762840b33dd24117326b88670818e24668aa65c5e80f8d71c192ba5803a9ca1415d72a81f3efcf1341379d41c'
  ],
  extractedParameterValues: { price: '2446.75' },
  witnesses: [
    {
      id: '0x307832343438393735373233363865616466363562666263356165633938643865353434336139303732',
      url: 'wss://witness.reclaimprotocol.org/ws'
    }
  ]
}
```

### Verify the proofs and transform proof for onchain

#### Verify the proofs

Install @reclaimprotocol/js-sdk

```bash 
$ npm install @reclaimprotocol/js-sdk
```

Import the verifyProof function from the js-sdk

```javascript
const { verifyProof } = require('@reclaimprotocol/js-sdk');
```

Use verifyProof(proof)

You must send the proofObject and not the verifiedResponse to the verifier for them to be able to verify.

```javascript
const isProofVerified = await verifyProof(proof);
```

it verifies the authenticity and completeness of a given proof. It checks if the proof contains signatures, recalculates the proof identifier, and verifies it against the provided signatures. If the verification fails, it will log the error and return false.

#### Transform proof for onchain

Transforms proof data into a format suitable for on-chain transactions, you need to use it before sending the proof to the blockchain.

Import the transformForOnchain function from the js-sdk

```javascript
const { transformForOnchain } = require('@reclaimprotocol/js-sdk');
```

Use transformForOnchain(proof) to transform the proof for onchain.

```javascript
const onchainProof = transformForOnchain(proof);
```


### Add Retries and Retry Interval

You can add retries and timeout to the fetch request. The default value for retries is 1 and timeout is 1000ms.

```
  const publicOptions = {
    method: 'GET', // or POST
    headers : {
      accept: 'application/json, text/plain, */*' 
    }
  }

  const privateOptions = {
    headers {
        apiKey: "123...456",
        someOtherHeader: "someOtherValue",
    }
  }

  const proof = await client.zkFetch(
    'https://your.url.org',
    publicOptions,
    privateOptions,
    5, // retries
    10000 // retryInterval
  )
```

### Add GeoLocation

You can add geolocation information to your fetch request. The default value for geoLocation is null.

Note: The geoLocation should be a two-letter ISO country code, for example, 'US' for the United States.

```
  const publicOptions = {
    method: 'GET', // or POST
    headers : {
      accept: 'application/json, text/plain, */*' 
    }
    // geoLocation should be a two-letter ISO country code, e.g., 'US' for the United States
    geoLocation: 'US'
  }

  const proof = await client.zkFetch(
    'https://your.url.org',
    publicOptions,
  )

```

## More examples

you can find more examples/starter packs here 

- [React Example](https://gitlab.reclaimprotocol.org/starterpacks/reclaim-zkfetch-client)
- [Express Example](https://gitlab.reclaimprotocol.org/starterpacks/zkfetch-express-example)

## License 
This library is governed by an [AGPL](./LICENSE.md) license.
That means, you can fork, modify and use for commercial use as long as the entire project is fully open sourced under an AGPL License.

If you wish to use commercially use this library in a closed source product, [you must take permission](https://t.me/protocolreclaim/1452).