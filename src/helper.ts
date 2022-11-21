import { BigNumber, Contract, providers, ethers } from "ethers";
import LRU from "lru-cache";
import { IUNISWAPV3FACTORY, UNISWAPV3FACTORY_ADDRESS, POOL_INIT_CODE_HASH } from "./constants";

//Create a custom type that to store the pool values
export type poolValues = {
  token0: string;
  token1: string;
  fee: number | BigNumber;
};

let cache: LRU<string, poolValues> = new LRU<string, poolValues>({
  max: 1000,
});

export const getPoolValues = async (
  poolAddress: string,
  IUNISWAPV3POOL: string[],
  provider: providers.Provider,
  blockNumber: number
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

export const createTwoAddress = (poolVal: poolValues, factoryContract: Contract) => {
  return ethers.utils.getCreate2Address(
    factoryContract.address,
    ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["address", "address", "uint24"],
        [poolVal.token0, poolVal.token1, poolVal.fee]
      )
    ),
    POOL_INIT_CODE_HASH
  );
};

//alternative method to confirm the pool address
//less gas effecient
/*
export const getPoolAddress = async (
  poolVal: poolValues,
  factoryContract: Contract,
  blockNumber: number
): Promise<string> => {
  const poolAddress = await factoryContract.getPool(poolVal.token0, poolVal.token1, poolVal.fee, {
    blockTag: blockNumber,
  });

  return poolAddress;
};
*/
