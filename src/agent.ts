import { providers } from "ethers";
import {
  Finding,
  HandleTransaction,
  TransactionEvent,
  getEthersProvider,
} from "forta-agent";
const { createFinding } = require("./finding");
const { IUNISWAPV3POOL, SWAP_EVENT } = require("./constants");
const {
  getPoolValues,
  getFactoryContract,
  getPoolAddress,
} = require("./helper");

export function provideHandleTransaction(
  provider: providers.Provider,
  SWAP_EVENT: string[],
  IUNISWAPV3POOL: string[]
): HandleTransaction {
  return async (txEvent: TransactionEvent): Promise<Finding[]> => {
    const findings: Finding[] = [];

    //Get the factory contract to use later when we call getPool func to verify pool address
    const factoryContract = getFactoryContract(provider);
    const bn = txEvent.blockNumber;

    // Filter out any swap logs from the blockchain that match our SWAP_EVENT
    const swapLogs = txEvent.filterLog(SWAP_EVENT);
    for (const log of swapLogs) {
      //We wrap this in a try/catch as any invalid uniswap pools will error out
      try {
        //Call getPoolValues to get the token addresses and fee from the pool contract
        //if this is a valid pool contract it will return the vals
        const poolVal = await getPoolValues(
          log.address,
          IUNISWAPV3POOL,
          provider,
          bn
        );

        //once we receive the poolVals we use them in the factory contract to get the pool address
        //if the pool address from the event log matches this pool address we have a valid uniswap pool
        //We can then create a finding and push it to our findings array
        const poolAddress = await getPoolAddress(poolVal, factoryContract, bn);
        if (poolAddress.toLowerCase() === log.address.toLowerCase()) {
          findings.push(createFinding(poolVal, poolAddress));
        }
      } catch {
        return findings;
      }
    }
    return findings;
  };
}

export default {
  handleTransaction: provideHandleTransaction(
    getEthersProvider(),
    SWAP_EVENT,
    IUNISWAPV3POOL
  ),
};
