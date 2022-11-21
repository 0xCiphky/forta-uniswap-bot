# Uniswap Swap Detection Bot

## Description

This bot detects any swaps made on the Uniswap protocol

## Supported Chains

- Ethereum

## Alerts

- UNISWAP-SWAP-1
  - Fired when a transaction contains swap made on the Uniswap protocol
  - Severity is always set to "Info"
  - Type is always set to "info"
  - Metadata:
    - pool: address of the liquidity pool of the two tokens
    - token0: address of the first token
    - token1: address of the second token
    - fee: fee of the liquidity pool

## Test Data

The bot behaviour can be verified with the following transactions:

- Transaction: 0x7e0c12d94158c861e2f403176b2f9b6308fc831a963fa2cfa07064714ae49e1c
  (https://etherscan.io/tx/0x7e0c12d94158c861e2f403176b2f9b6308fc831a963fa2cfa07064714ae49e1c)
