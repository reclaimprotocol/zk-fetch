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
    method: 'GET',
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
    method: 'GET',
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
    method: 'GET',
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