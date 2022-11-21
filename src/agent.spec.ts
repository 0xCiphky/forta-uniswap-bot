import { TestTransactionEvent, MockEthersProvider } from "forta-agent-tools/lib/test";
import { createAddress } from "forta-agent-tools";
import { ethers, HandleTransaction } from "forta-agent";
import { provideHandleTransaction } from "./agent";
import { BigNumber } from "ethers";
import { Interface } from "ethers/lib/utils";
import { createFinding } from "./finding";
import { poolValues } from "./helper";
import { IUNISWAPV3POOL, SWAP_EVENT, MINT_EVENT } from "./constants";

// Test values for a valid uniswap event
const TEST_VAL1 = {
  TOKEN0_ADDR: "0x3845badAde8e6dFF049820680d1F14bD3903a5d0",
  TOKEN0_VAL: BigNumber.from("100"),
  TOKEN1_ADDR: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  TOKEN1_VAL: BigNumber.from("400"),
  POOL_ADDR: "0x5859ebE6Fd3BBC6bD646b73a5DbB09a5D7B6e7B7",
  Fee: BigNumber.from("3000"),
};

// Test values for a valid uniswap event but from a diff pool from the firts test vals
const TEST_VAL2 = {
  TOKEN2_ADDR: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
  TOKEN2_VAL: BigNumber.from("100"),
  TOKEN3_ADDR: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  TOKEN3_VAL: BigNumber.from("400"),
  POOL_ADDR2: "0x4585FE77225b41b697C938B018E2Ac67Ac5a20c0",
  Fee: BigNumber.from("500"),
};

// These are also test vals for the swap event but can remain the same so we use these for both cases
const SQRT_PRICE = BigNumber.from("10");
const LIQ = BigNumber.from("1000");
const TICK = BigNumber.from("1");

const POOL_IFACE = new ethers.utils.Interface(IUNISWAPV3POOL);

// helper function that simulates a function call from a certain contract
// E.G for token0 function in pool contract we return the token address when called with correct params
const MakeMockCall = (
  mockProvider: MockEthersProvider,
  id: string,
  inp: any[],
  outp: any[],
  example: number = 1,
  block: number = 10,
  intface: Interface = POOL_IFACE,
  addr: string = TEST_VAL1.POOL_ADDR
) => {
  // This is used for when we test multiple swaps in diff pools
  // changes to a diif pool address
  if (example == 2) {
    addr = TEST_VAL2.POOL_ADDR2;
  }
  // We use the pool contract as the default for these vals
  // However when we call a func from the fact contract we need to change to these vals

  mockProvider.addCallTo(addr, block, intface, id, {
    inputs: inp,
    outputs: outp,
  });
};

describe("Uniswap swap detection bot", () => {
  let handleTransaction: HandleTransaction;
  let mockProvider: MockEthersProvider;
  let provider: ethers.providers.Provider;

  beforeEach(() => {
    mockProvider = new MockEthersProvider();
    provider = mockProvider as unknown as ethers.providers.Provider;
    handleTransaction = provideHandleTransaction(provider, SWAP_EVENT, IUNISWAPV3POOL);
  });

  it("returns an empty finding if there are no swap events", async () => {
    const txEvent = new TestTransactionEvent();
    const findings = await handleTransaction(txEvent);
    expect(findings.length).toEqual(0);
    expect(findings).toStrictEqual([]);
  });

  it("returns an empty finding if there are other events but no swap event", async () => {
    const txEvent = new TestTransactionEvent()
      .setBlock(10)
      .addEventLog(MINT_EVENT[0], createAddress("0x3"), [createAddress("0x4"), 1]);
    const findings = await handleTransaction(txEvent);
    expect(findings.length).toEqual(0);
    expect(findings).toStrictEqual([]);
  });

  it("returns no findings if there is a swap event from a different pool(not uniswap)", async () => {
    //In this case we assume that there exists a pool contract that has the token/fee funcs so returns val
    //However when checked with the uniswap fact contract getPool func it fails as it is not a uniswap pool
    MakeMockCall(mockProvider, "token0", [], [TEST_VAL1.TOKEN0_ADDR]);
    MakeMockCall(mockProvider, "token1", [], [TEST_VAL1.TOKEN1_ADDR]);
    MakeMockCall(mockProvider, "fee", [], [TEST_VAL1.Fee]);

    const txEvent = new TestTransactionEvent()
      .setBlock(10)
      .addEventLog(SWAP_EVENT[0], createAddress("0x55"), [
        TEST_VAL1.TOKEN0_ADDR,
        TEST_VAL1.TOKEN1_ADDR,
        TEST_VAL1.TOKEN0_VAL,
        TEST_VAL1.TOKEN1_VAL,
        SQRT_PRICE,
        LIQ,
        TICK,
      ]);

    const findings = await handleTransaction(txEvent);
    expect(findings.length).toEqual(0);
    expect(findings).toStrictEqual([]);
  });

  it("returns a finding if there is a single valid swap event from uniswap", async () => {
    MakeMockCall(mockProvider, "token0", [], [TEST_VAL1.TOKEN0_ADDR]);
    MakeMockCall(mockProvider, "token1", [], [TEST_VAL1.TOKEN1_ADDR]);
    MakeMockCall(mockProvider, "fee", [], [TEST_VAL1.Fee]);

    const txEvent = new TestTransactionEvent()
      .setBlock(10)
      .addEventLog(SWAP_EVENT[0], TEST_VAL1.POOL_ADDR, [
        TEST_VAL1.TOKEN0_ADDR,
        TEST_VAL1.TOKEN1_ADDR,
        TEST_VAL1.TOKEN0_VAL,
        TEST_VAL1.TOKEN1_VAL,
        SQRT_PRICE,
        LIQ,
        TICK,
      ]);

    const poolVal: poolValues = {
      token0: TEST_VAL1.TOKEN0_ADDR,
      token1: TEST_VAL1.TOKEN1_ADDR,
      fee: TEST_VAL1.Fee,
    };
    const mockFinding = createFinding(poolVal, TEST_VAL1.POOL_ADDR);
    const findings = await handleTransaction(txEvent);

    expect(findings.length).toEqual(1);
    expect(findings[0]).toStrictEqual(mockFinding);
  });

  it("returns multiple findings if there is multiple valid swap events from uniswap (different pools)", async () => {
    MakeMockCall(mockProvider, "token0", [], [TEST_VAL1.TOKEN0_ADDR]);
    MakeMockCall(mockProvider, "token1", [], [TEST_VAL1.TOKEN1_ADDR]);
    MakeMockCall(mockProvider, "fee", [], [TEST_VAL1.Fee]);

    // MockCall for the second swap event in a different pool
    MakeMockCall(mockProvider, "token0", [], [TEST_VAL2.TOKEN2_ADDR], 2);
    MakeMockCall(mockProvider, "token1", [], [TEST_VAL2.TOKEN3_ADDR], 2);
    MakeMockCall(mockProvider, "fee", [], [TEST_VAL2.Fee], 2);

    const txEvent = new TestTransactionEvent()
      .setBlock(10)
      .addEventLog(SWAP_EVENT[0], TEST_VAL1.POOL_ADDR, [
        TEST_VAL1.TOKEN0_ADDR,
        TEST_VAL1.TOKEN1_ADDR,
        TEST_VAL1.TOKEN0_VAL,
        TEST_VAL1.TOKEN1_VAL,
        SQRT_PRICE,
        LIQ,
        TICK,
      ])
      // Event log fro the second swap event in a diff pool
      .addEventLog(SWAP_EVENT[0], TEST_VAL2.POOL_ADDR2, [
        TEST_VAL2.TOKEN2_ADDR,
        TEST_VAL2.TOKEN3_ADDR,
        TEST_VAL2.TOKEN2_VAL,
        TEST_VAL2.TOKEN3_VAL,
        SQRT_PRICE,
        LIQ,
        TICK,
      ]);

    const poolVal: poolValues = {
      token0: TEST_VAL1.TOKEN0_ADDR,
      token1: TEST_VAL1.TOKEN1_ADDR,
      fee: TEST_VAL1.Fee,
    };
    const poolVal2: poolValues = {
      token0: TEST_VAL2.TOKEN2_ADDR,
      token1: TEST_VAL2.TOKEN3_ADDR,
      fee: TEST_VAL2.Fee,
    };
    const mockFinding = createFinding(poolVal, TEST_VAL1.POOL_ADDR);
    const mockFinding2 = createFinding(poolVal2, TEST_VAL2.POOL_ADDR2);

    const findings = await handleTransaction(txEvent);
    expect(findings.length).toEqual(2);
    expect(findings[0]).toStrictEqual(mockFinding);
    expect(findings[1]).toStrictEqual(mockFinding2);
  });
});
