import {
  TestTransactionEvent,
  MockEthersProvider,
} from "forta-agent-tools/lib/test";
import { createAddress, createChecksumAddress } from "forta-agent-tools";
import { ethers, HandleTransaction } from "forta-agent";
import { provideHandleTransaction } from "./agent";
import { BigNumber } from "ethers";
import { Interface } from "ethers/lib/utils";
import { createFinding } from "./finding";
import { poolValues } from "./helper";

const {
  IUNISWAPV3POOL,
  SWAP_EVENT,
  UNISWAPV3FACTORY_ADDRESS,
  IUNISWAPV3FACTORY,
  MINT_EVENT,
} = require("./constants");

// Test values for a valid uniswap event
const TEST_VAL1 = {
  TOKEN0_ADDR: createChecksumAddress("0x1"),
  TOKEN0_VAL: BigNumber.from("100"),
  TOKEN1_ADDR: createChecksumAddress("0x2"),
  TOKEN1_VAL: BigNumber.from("400"),
  POOL_ADDR: createChecksumAddress("0x88"),
};

// Test values for a valid uniswap event but from a diff pool from the firts test vals
const TEST_VAL2 = {
  TOKEN2_ADDR: createAddress("0x11"),
  TOKEN2_VAL: BigNumber.from("100"),
  TOKEN3_ADDR: createAddress("0x22"),
  TOKEN3_VAL: BigNumber.from("400"),
  POOL_ADDR2: createChecksumAddress("0x77"),
};

// These are also test vals for the swap event but can remain the same so we use these for both cases
const SQRT_PRICE = BigNumber.from("10");
const LIQ = BigNumber.from("1000");
const TICK = BigNumber.from("1");
const FEE = BigNumber.from("3000");

const POOL_IFACE = new ethers.utils.Interface(IUNISWAPV3POOL);
const FACT_IFACE = new ethers.utils.Interface(IUNISWAPV3FACTORY);

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
  if (id === "getPool") {
    intface = FACT_IFACE;
    addr = UNISWAPV3FACTORY_ADDRESS;
  }
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
    handleTransaction = provideHandleTransaction(
      provider,
      SWAP_EVENT,
      IUNISWAPV3POOL
    );
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
      .addEventLog(MINT_EVENT[0], createAddress("0x3"), [
        createAddress("0x4"),
        1,
      ]);
    const findings = await handleTransaction(txEvent);
    expect(findings.length).toEqual(0);
    expect(findings).toStrictEqual([]);
  });

  it("returns no findings if there is a swap event from a different pool(not uniswap)", async () => {
    //In this case we assume that there exists a pool contract that has the token/fee funcs so returns val
    //However when checked with the uniswap fact contract getPool func it fails as it is not a uniswap pool
    MakeMockCall(mockProvider, "token0", [], [TEST_VAL1.TOKEN0_ADDR]);
    MakeMockCall(mockProvider, "token1", [], [TEST_VAL1.TOKEN1_ADDR]);
    MakeMockCall(mockProvider, "fee", [], [FEE]);
    MakeMockCall(
      mockProvider,
      "getPool",
      [TEST_VAL1.TOKEN0_ADDR, TEST_VAL1.TOKEN1_ADDR, FEE],
      [createChecksumAddress("0x295")]
    );

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
    MakeMockCall(mockProvider, "fee", [], [FEE]);
    MakeMockCall(
      mockProvider,
      "getPool",
      [TEST_VAL1.TOKEN0_ADDR, TEST_VAL1.TOKEN1_ADDR, FEE],
      [TEST_VAL1.POOL_ADDR]
    );

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
      fee: FEE,
    };
    const mockFinding = createFinding(poolVal, TEST_VAL1.POOL_ADDR);
    const findings = await handleTransaction(txEvent);

    expect(findings.length).toEqual(1);
    expect(findings[0]).toStrictEqual(mockFinding);
  });

  it("returns multiple findings if there is multiple valid swap events from uniswap (different pools)", async () => {
    MakeMockCall(mockProvider, "token0", [], [TEST_VAL1.TOKEN0_ADDR]);
    MakeMockCall(mockProvider, "token1", [], [TEST_VAL1.TOKEN1_ADDR]);
    MakeMockCall(mockProvider, "fee", [], [FEE]);
    MakeMockCall(
      mockProvider,
      "getPool",
      [TEST_VAL1.TOKEN0_ADDR, TEST_VAL1.TOKEN1_ADDR, FEE],
      [TEST_VAL1.POOL_ADDR]
    );
    // MockCall for the second swap event in a different pool
    MakeMockCall(mockProvider, "token0", [], [TEST_VAL2.TOKEN2_ADDR], 2);
    MakeMockCall(mockProvider, "token1", [], [TEST_VAL2.TOKEN3_ADDR], 2);
    MakeMockCall(mockProvider, "fee", [], [FEE], 2);
    MakeMockCall(
      mockProvider,
      "getPool",
      [TEST_VAL2.TOKEN2_ADDR, TEST_VAL2.TOKEN3_ADDR, FEE],
      [TEST_VAL2.POOL_ADDR2],
      2
    );

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
      fee: FEE,
    };
    const poolVal2: poolValues = {
      token0: TEST_VAL2.TOKEN2_ADDR,
      token1: TEST_VAL2.TOKEN3_ADDR,
      fee: FEE,
    };
    const mockFinding = createFinding(poolVal, TEST_VAL1.POOL_ADDR);
    const mockFinding2 = createFinding(poolVal2, TEST_VAL2.POOL_ADDR2);

    const findings = await handleTransaction(txEvent);
    expect(findings.length).toEqual(2);
    expect(findings[0]).toStrictEqual(mockFinding);
    expect(findings[1]).toStrictEqual(mockFinding2);
  });
});
