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


> **Reclaim Devtool has been deprecated.** Application IDs and secrets from the Devtool are no longer supported. Use [Reclaim Builder](https://build.reclaimprotocol.org) and an organization token — see [Migrating from Devtool to Builder](#migrating-from-devtool-to-builder).

## Installation

```bash
npm install @reclaimprotocol/zk-fetch
```

## Requirements

- **Node.js 22 or higher.** Server-side only — zkFetch runs in Node.js, not in the browser.
- **A Reclaim Builder organization token** (`rorg_...`) from [Reclaim Builder](https://build.reclaimprotocol.org). Treat it like a password: keep it on your server, never in frontend code.
- **For TEE mode only**, one of these platforms:

  | OS | Architectures | Minimum version |
  | --- | --- | --- |
  | macOS | x64, arm64 | macOS 13 |
  | Linux (glibc) | x64, arm64 | glibc 2.17 |
  | Windows | x64 | Windows 10 |

  On other platforms, requests use the non-TEE path. In slim Docker images, install the system CA certificates (for example `apt-get install -y ca-certificates`), or TEE requests will fail TLS verification.


## Quick Start

```javascript
const { ReclaimClient } = require("@reclaimprotocol/zk-fetch");

// Initialize the client with your Builder organization token
const client = new ReclaimClient({ orgToken: process.env.RECLAIM_ORG_TOKEN });

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


## Authentication

### Builder Mode (Organization Token)

Builder is the supported way to authenticate zkFetch. Instead of an application id/secret, the client holds a Builder organization token (`rorg_...`) and asks [Reclaim Builder](https://build.reclaimprotocol.org) to authorize each `zkFetch` call, drawing down your org's `ZKFETCH` quota.

```javascript
const { ReclaimClient } = require('@reclaimprotocol/zk-fetch');

const client = new ReclaimClient({
  orgToken: 'rorg_...',              // your Builder organization token
  builderBaseUrl: undefined,          // optional, defaults to https://build.reclaimprotocol.org
});

const proof = await client.zkFetch('https://api.github.com/user', {
  method: 'GET',
  headers: { Authorization: 'Bearer <github token>' },
});
```

Every call asks Builder for a short-lived, single-use authorization for the request's target host immediately before connecting to the attestor -- it is never requested ahead of time or reused across calls. The response includes an attestor token only when Builder has an attestor signing key configured; otherwise the token is omitted and the client connects to the attestor without one. Either way, the call counts against your quota. This is what actually meters zkFetch against your Builder plan; the fetch and the proof itself still happen entirely in your own process.

If your org's `ZKFETCH` quota is exhausted, Builder rejects the authorization and the call rejects with a `BuilderQuotaExceededError` (a subclass of `BuilderAuthorizationError`) instead of a generic error, so you can catch it specifically:

```javascript
const { ReclaimClient, BuilderQuotaExceededError } = require('@reclaimprotocol/zk-fetch');

try {
  const proof = await client.zkFetch('https://api.github.com/user', { method: 'GET' });
} catch (error) {
  if (error instanceof BuilderQuotaExceededError) {
    // error.status is 402 or 429
    console.error('Out of zkFetch quota for this billing period');
  } else {
    throw error;
  }
}
```

> Builder mode works with both TEE mode (the default) and the non-TEE path. Each attempt on either path is authorized and counted against your quota.

### Migrating from Devtool to Builder

1. Create an organization in [Reclaim Builder](https://build.reclaimprotocol.org) and issue an organization token (`rorg_...`).
2. Replace the application id/secret with the token. Everything else — `zkFetch` options, response matches, redactions and the proof format — stays the same:

```javascript
// Before (Devtool, deprecated)
const client = new ReclaimClient('APPLICATION_ID', 'APPLICATION_SECRET', logs, retries);

// After (Builder)
const client = new ReclaimClient({ orgToken: process.env.RECLAIM_ORG_TOKEN, logs, retries });
```

3. If you used `generateSessionSignature` to hand signatures to an untrusted client, move those `zkFetch` calls to your server instead. Builder org tokens must stay server-side.

## Client Configuration

Builder mode takes a single options object:

```javascript
new ReclaimClient({ orgToken, builderBaseUrl?, logs?, retries? })
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `orgToken` | `string` | — | Your Builder organization token (`rorg_...`). Required. |
| `builderBaseUrl` | `string` | `https://build.reclaimprotocol.org` | Builder API base URL. |
| `logs` | `boolean` | `false` | Enable internal logging. |
| `retries` | `number` | `1` | Default number of attempts for every `zkFetch` call that doesn't pass its own `retries`. Must be a positive integer. |

```javascript
// logs enabled, and every zkFetch defaults to 3 attempts
const client = new ReclaimClient({ orgToken: process.env.RECLAIM_ORG_TOKEN, logs: true, retries: 3 });
```

### Using TEE Mode

> See [Requirements](#requirements) for the platforms TEE mode supports.

Requests run in TEE (Trusted Execution Environment) mode by default. A request stays on the non-TEE path when you don't set `useTee` and it:

- sets `zkEngine` (see [Choosing the ZK Engine](#choosing-the-zk-engine-non-tee)),
- uses an `oprf-raw` redaction hash, or
- runs on a platform without a TEE library (see [Requirements](#requirements)).

Set `useTee` to choose explicitly; an explicit value always wins:

```javascript
// Force the non-TEE path for this request
const proof = await client.zkFetch('https://api.example.com/data', {
  method: 'GET',
  useTee: false
});
```

#### The TEE library download

TEE mode runs through a native library (`libreclaim`) that isn't bundled in the npm package. `npm install` downloads the one for your platform (about 30–40 MB) from this repo's [GitHub Releases](https://github.com/reclaimprotocol/zk-fetch/releases) and checks it against a sha256 pinned in the package; a file that doesn't match is never loaded. If the download was skipped (for example `npm install --ignore-scripts`) or failed, the first TEE request downloads it instead. It's stored in the package's `lib/` folder, or in your user cache folder if `node_modules` is read-only.

| Environment variable | Effect |
| --- | --- |
| `RECLAIM_TEE_SKIP_DOWNLOAD=1` | Skip the download during `npm install`. |
| `RECLAIM_TEE_LIB_BASE_URL` | Download from a mirror instead of GitHub Releases. The sha256 check still applies. |
| `RECLAIM_TEE_LIB_PATH` | Load this file and never download. For offline or locked-down machines; you're responsible for verifying the file. |

Non-TEE requests never need the library.

### Choosing the ZK Engine (non-TEE)

The non-TEE path uses the `stwo` proof engine by default. You can opt back into `snarkjs` per request:

```javascript
const proof = await client.zkFetch('https://api.example.com/data', {
  method: 'GET',
  zkEngine: 'snarkjs'  // 'snarkjs' | 'stwo' (default 'stwo')
});
```

Setting `zkEngine` keeps a request on the non-TEE path. It's ignored if you also pass `useTee: true`, since the TEE path picks its own engine.

> **snarkjs requires extra setup.** snarkjs proofs need the `chacha20` / `aes-128-ctr` / `aes-256-ctr` circuit files
> (`circuit.wasm`, `circuit_final.zkey`, `circuit.r1cs`) which are not shipped in the npm tarball. After `npm install`,
> run the bundled downloader once:
>
> ```bash
> node node_modules/@reclaimprotocol/zk-symmetric-crypto/lib/scripts/download-files
> ```
>
> Without these files, `zkEngine: 'snarkjs'` will fail at proof-generation time. `stwo` ships its assets inline, so the
> default path works out of the box.


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
    headers: {
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
        // Optional: replace the matched span with an OPRF commitment instead
        // of a plain redaction byte. When set, `extractedParameterValues.<name>`
        // returns the OPRF hash string (not the plaintext).
        //   'oprf-mpc' — TEE path (the default); computed by the TEEs with MPC
        //   'oprf-raw' — non-TEE path only; keeps the request off TEE
        hash: 'oprf-mpc' // 'oprf-mpc' | 'oprf-raw'
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

Verify proofs on your server with [`@reclaimprotocol/client`](https://www.npmjs.com/package/@reclaimprotocol/client) (Node.js 22+):

```bash
npm install @reclaimprotocol/client
```

The verifier rebuilds the hash of the request it expects (same URL, method, response matches and redactions the prover used), then checks the proof against that hash and against the attestors Reclaim publishes:

```javascript
import { hashProofClaimParams, verifyRequestProof } from '@reclaimprotocol/client';

// The request you expect the proof to cover
const hashes = hashProofClaimParams({
  url: 'https://api.example.com/data',
  method: 'GET',
  responseMatches: [{ type: 'regex', value: '"price":"(?<price>[\\d\\.]+)"' }],
  responseRedactions: [{ regex: '"price":"(?<price>[\\d\\.]+)"' }],
});

const outcome = await verifyRequestProof(proof, {
  hashes,
  // Trust the attestors listed in Reclaim Builder's published key set
  attestorJwksUrl: 'https://build.reclaimprotocol.org/.well-known/jwks.json',
});

if (!outcome.valid) {
  throw new Error(`Invalid proof: ${outcome.reason}`);
}
```

Pass `hashProofClaimParams` the same `url`, `method`, `responseMatches` and `responseRedactions` you gave `zkFetch`, including any `hash` on a redaction (for example `{ regex, hash: 'oprf-mpc' }`); otherwise the hashes won't match and verification fails. Empty or unset fields such as `body: ''`, `jsonPath: ''` or `invert: undefined` don't change the hash, so you can leave them out.

`verifyRequestProof` checks that the proof is signed by a trusted attestor, that the signed claim hasn't been modified, and that it was produced for the expected request: a valid proof for a different URL or different matches is rejected. It returns `{ valid, reason }` instead of throwing. Send the verifier the full proof object returned by `zkFetch`.

`@reclaimprotocol/client` is ESM-only. From CommonJS, load it with `const { hashProofClaimParams, verifyRequestProof } = await import('@reclaimprotocol/client');`.

#### Transform proof for onchain

`transformForOnchain` reshapes a proof into the format Reclaim's verifier contracts take. Verify the proof first; this only reshapes it.

```javascript
const { transformForOnchain } = require('@reclaimprotocol/zk-fetch');

const onchainProof = transformForOnchain(proof);
// { claimInfo: { context, parameters, provider },
//   signedClaim: { claim: { epoch, identifier, owner, timestampS }, signatures } }
```

> `@reclaimprotocol/js-sdk` has been discontinued. Use the two replacements above instead of its `verifyProof` and `transformForOnchain`.


### Add Retries and Retry Interval

You can add retries and a retry interval to the fetch request. The per-call default for `retries` is `1` (or whatever you set as the client-level default in the constructor), and `retryInterval` defaults to `1000`ms. A per-call value overrides the client default.

```
  const publicOptions = {
    method: 'GET', // or POST
    headers : {
      accept: 'application/json, text/plain, */*' 
    }
  }

  const privateOptions = {
    headers: {
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

> **TEE note:** on the TEE path, a fresh enclave allocation can time out on a cold start. To avoid a single transient timeout hard-failing the request, the TEE path automatically retries such transient failures a few times even when `retries` is `1`. Non-transient errors still fail fast per your `retries`.

### Add GeoLocation

You can add geolocation information to your fetch request. The default value for geoLocation is null.

Note: The geoLocation should be a two-letter ISO country code, for example, 'US' for the United States.

```
  const publicOptions = {
    method: 'GET', // or POST
    headers : {
      accept: 'application/json, text/plain, */*' 
    },
    // geoLocation should be a two-letter ISO country code, e.g., 'US' for the United States
    geoLocation: 'US'
  }

  const proof = await client.zkFetch(
    'https://your.url.org',
    publicOptions,
  )

```

## License 
This library is governed by an [AGPL](./LICENSE.md) license.
That means, you can fork, modify and use for commercial use as long as the entire project is fully open sourced under an AGPL License.

If you wish to use commercially use this library in a closed source product, [you must take permission](https://t.me/protocolreclaim/1452).