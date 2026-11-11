import { Proof } from './interfaces';

/** The proof in the shape Reclaim's verifier contracts take. */
export interface OnchainProof {
  claimInfo: {
    context: string;
    parameters: string;
    provider: string;
  };
  signedClaim: {
    claim: {
      epoch: number;
      identifier: string;
      owner: string;
      timestampS: number;
    };
    signatures: string[];
  };
}

/**
 * Reshapes a zkFetch proof for Reclaim's on-chain verifier contracts. Same
 * output (including key order) as `transformForOnchain` from
 * `@reclaimprotocol/js-sdk`, so existing contract calls don't change.
 * Verify the proof first (see the README); this only reshapes it.
 */
export function transformForOnchain(proof: Proof): OnchainProof {
  const { claimData, signatures } = proof;
  return {
    claimInfo: {
      context: claimData.context,
      parameters: claimData.parameters,
      provider: claimData.provider,
    },
    signedClaim: {
      claim: {
        epoch: claimData.epoch,
        identifier: claimData.identifier,
        owner: claimData.owner,
        timestampS: claimData.timestampS,
      },
      signatures,
    },
  };
}
