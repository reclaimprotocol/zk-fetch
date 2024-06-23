# zkFetch.js
_fetch, but with a zkproof_

This library lets you fetch any remote resource over an https endpoint. Along with the response, you also get a proof of correct execution of the fetch that can be verified by a third party. 

For example, if you do a fetch with a private api key that the third party doesn't have access to, how do you prove to them that you executed the fetch correctly using the api key, and not sharing with them an arbitrary or tampered response? zkfetch.

zkFetch is based on [Reclaim Protocol](https://reclaimprotocol.org)

**Note : We recommend using zkproof only for data that is unlikely to change within 5s, i.e. during the process of proof generation**

## Usage
### Install zkfetch
```
$ npm install @reclaimprotocol/zkfetch
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
  const proof = await zkfetch(
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

  const proof = await zkfetch(
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

  const address = '0x123...789';

  const proof = await zkfetch(
    'https://your.url.org',
    publicOptions,
    privateOptions,
    address,
  )
```
## Using the response
The response looks like the follows
```
    {
      identifier: '0xd4f0afed947068fd67f08ffdd8c8be48228e3cb9c358c54c008d7586769c9ddc',
      claimData: {
        provider: 'http',
        parameters: '{"headers":{"accept":"application/json, text/plain, */*"},"method":"GET","responseMatches":[{"type":"contains","value":"<HTTP RESPONSE TEXT>"}],"responseRedactions":[],"url":"https://sampleurl.com"}',
        owner: '0x1be31a94361a391bbafb2a4ccd704f57dc04d4bb',
        timestampS: 1719150088,
        context: '{"providerHash":"0xe3e98ad8309b5489e61bd47c5eef8d75da819a1c7fe73b0972bccbed5bc13cda"}',
        identifier: '0xd4f0afed947068fd67f08ffdd8c8be48228e3cb9c358c54c008d7586769c9ddc',
        epoch: 1
      },
      signatures: [
        '0xbfc64752eab0713ef715df45f04219e201b669ac58c84a6dff3bfc01b4f8a50c2dda58c18f154f5ab5c17b84179bc41cb9a47e762b792f8dadb1c1f5f5b4f9e91b'
      ],
      witnesses: [
        {
          id: '0x244897572368eadf65bfbc5aec98d8e5443a9072',
          url: 'https://reclaim-node.questbook.app'
        }
      ]
    }
```

To use the response, 
```
  const verifiedResponse = JSON.parse(ethPriceProof.claimData.parameters).responseMatches[0].value;
```

You must send the proofObject and not the verifiedResponse to the verifier for them to be able to verify.

The verifier can then verify the proof as mentioned on the [docs here](https://docs.reclaimprotocol.org/js/callback#verify-the-proofs)

## License 
This library is governed by an [AGPL](./LICENSE.md) license.
That means, you can fork, modify and use for commercial use as long as the entire project is fully open sourced under an AGPL License.

If you wish to use commercially use this library in a closed source product, [you must take permission](https://t.me/protocolreclaim/1452).