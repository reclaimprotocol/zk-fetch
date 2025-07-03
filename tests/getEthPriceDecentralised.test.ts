import { getEthPriceDecentralised } from "./getEthPriceDecentralised";
import { expect, test, describe } from "vitest";

//TODO: Update tp fetch from contracts
const NUM_PROOFS = 2;

describe("ETH Price Tests - Decentralized", () => {
  test("should return an array of proofs", async () => {
    const ethPriceProof = await getEthPriceDecentralised();
    const price = parseFloat(ethPriceProof[0]?.extractedParameterValues?.price);

    expect(ethPriceProof).toBeDefined();
    expect(ethPriceProof).toHaveLength(NUM_PROOFS);
    expect(price).toBeDefined();
    expect(price).toBeGreaterThan(0);
  }, 100000);
});
