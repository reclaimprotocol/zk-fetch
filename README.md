# zkFetch.js
_fetch, but with a zkproof_

This library lets you fetch any remote resource over an https endpoint. Along with the response, you also get a proof of correct execution of the fetch that can be verified by a third party. 

For example, if you do a fetch with a private api key that the third party doesn't have access to, how do you prove to them that you executed the fetch correctly using the api key, and not sharing with them an arbitrary or tampered response? zkfetch.

zkFetch is based on [Reclaim Protocol](https://reclaimprotocol.org)

**Note : We recommend using zkproof only for data that is unlikely to change within 5s, i.e. during the process of proof generation**

## Pre-requisites

An application ID and secret from Reclaim Protocol. You can get one from the  [Reclaim Developer Protocol](https://dev.reclaimprotocol.org/)

## Usage

```
$ npm install @reclaimprotocol/zk-fetch
```

Import 
```
  const { ReclaimClient } = require("@reclaimprotocol/zk-fetch");
```

### Initialize Reclaim Client

```javascript
const client = new Reclaim('APPLICATION_ID', 'APPLICATION_SECRET');
```

### For public endpoints
If the endpoint you want to _fetch_ and generate a proof of the response. This endpoint is public, and doesn't need any private data like auth headers/api keys.

This is useful when
- Verifier needs to verify without re-doing the api call
- The API doesn't need any private headers or auth
- The proof or response needs to be generated for a particular endpoint now, and verified later

```
  const publicOptions = {
    method: 'GET', // or POST
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

### For commiting proofs
This is used when the proof needs guarantees on who generated it. This is particularly useful when you want to reward thirdparty entities for generating proofs of fetch responses.

```  

  //beta

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
  )
```

## Using the response
The response looks like the follows
```
    {
  request: {
    request: {
      id: 1820248759,
      host: 'api.coingecko.com',
      port: 443,
      geoLocation: ''
    },
    data: {
      provider: 'http',
      parameters: '{"method":"GET","responseMatches":[{"type":"contains","value":"{\\"ethereum\\":{\\"usd\\":3436.38}}"}],"responseRedactions":[],"url":"https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"}',
      owner: '0xf218b59d7794e32693f5d3236e011c233e249105',
      timestampS: 1721298792,
      context: ''
    },
    transcript: [
      [{
    sender: 1,
    message: <Buffer 16 03 03 01 93 01a 4b 06 19 20 6c 69 b8 b0 54 7e ... 358 more bytes>,
  },...],
    ],
    signatures: {
      requestSignature: <Buffer 36 8b 35 d0 82 66 43 d6 18 04 97 25 7e 17 70 bc d3 fc ad 27 aa e9 b1 c9 39 ... 15 more bytes>
    },
    zkEngine: 0
  },
  claim: {
    provider: 'http',
    parameters: '{"method":"GET","responseMatches":[{"type":"contains","value":"{\\"ethereum\\":{\\"usd\\":3436.38}}"}],"responseRedactions":[],"url":"https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"}',
    owner: '0xf218b59d7794e32693f5d3236e011c233e249105',
    timestampS: 1721298792,
    context: '',
    identifier: '0xc0bae7878d46ca70d86dcb37782385ba78162625cc2a2f3dc5cf05ba76cc3b58',
    epoch: 1
  },
  error: undefined,
  signatures: {
    witnessAddress: '0x244897572368eadf65bfbc5aec98d8e5443a9072',
    claimSignature: <Buffer c2 ba bd cf 7a  8d bf 49 e7 73 86 df ee 8d c4 15 e6 12 5c d5 da aa 61 b6 2a 96 d6 ... 15 more bytes>,
    resultSignature: <Buffer 19 b7 71 36 5e de 68 72 3f 8c 59 40 95 bf ad 24 f1 24 bc b8 d6 bd ... 15 more bytes>
  }
}
```

To use the response, 
```
  const verifiedResponse = JSON.parse(proof?.claim?.context)?.responseMatches[0]?.value
```

### Verify the proofs

Install @reclaimprotocol/js-sdk

```bash 
$ npm install @reclaimprotocol/js-sdk
```

Import the Reclaim class from the js-sdk

```javascript
const { Reclaim } = require('@reclaimprotocol/js-sdk');
```

Use Reclaim.verifySignedProof(proof)

You must send the proofObject and not the verifiedResponse to the verifier for them to be able to verify.

```javascript
const isProofVerified = await Reclaim.verifySignedProof(proof);
```

it verifies the authenticity and completeness of a given proof. It checks if the proof contains signatures, recalculates the proof identifier, and verifies it against the provided signatures. If the verification fails, it will log the error and return false.

More information about the verifySignedProof method can be found [here](https://docs.reclaimprotocol.org/sdk-methods#verifysignedproofproof--promiseboolean)

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
You can see an example of how to use zkFetch [here](https://gitlab.reclaimprotocol.org/starterpacks/reclaim-zkfetch-client).

## License 
This library is governed by an [AGPL](./LICENSE.md) license.
That means, you can fork, modify and use for commercial use as long as the entire project is fully open sourced under an AGPL License.

If you wish to use commercially use this library in a closed source product, [you must take permission](https://t.me/protocolreclaim/1452).