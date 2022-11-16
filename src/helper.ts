import { BigNumber, Contract, providers } from "ethers";
import LRU from "lru-cache";

const { IUNISWAPV3FACTORY, UNISWAPV3FACTORY_ADDRESS } = require("./constants");

//Create a custom type that to store the pool values
export type poolValues = {
  token0: string;
  token1: string;
  fee: number | BigNumber;
};

export const getPoolValues = async (
  poolAddress: string,
  IUNISWAPV3POOL: string[],
  provider: providers.Provider,
  blockNumber: number,
  cache: LRU<string, poolValues>
): Promise<poolValues> => {
  cache = new LRU<string, poolValues>({
    max: 1000,
  });

  //If we have called this function before with the same pool address, it
  //should have the vals in cache so we can return them and skip everything else
  const key: string = poolAddress;
  if (cache.has(key)) return cache.get(key) as poolValues;

  const uniswap_pool = new Contract(poolAddress, IUNISWAPV3POOL, provider);

  let token0 = await uniswap_pool.token0({ blockTag: blockNumber });
  let token1 = await uniswap_pool.token1({ blockTag: blockNumber });
  let fee = await uniswap_pool.fee({ blockTag: blockNumber });

  // Store vals in cache so we don't repeat the same calls
  cache.set(key, { token0, token1, fee } as poolValues);

  return { token0, token1, fee } as poolValues;
};

export const getFactoryContract = (provider: providers.Provider): Contract => {
  return new Contract(UNISWAPV3FACTORY_ADDRESS, IUNISWAPV3FACTORY, provider);
};

export const getPoolAddress = async (
  poolVal: poolValues,
  factoryContract: Contract,
  blockNumber: number
): Promise<string> => {
  const poolAddress = await factoryContract.getPool(
    poolVal.token0,
    poolVal.token1,
    poolVal.fee,
    { blockTag: blockNumber }
  );

  return poolAddress;
};
