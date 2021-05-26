# Crypto.org Chain NFT generator

## WARNING
This tool will attempt to create NFTs on Crypto.org Chain. There is no guarantee for the correctness of this program. Use it at your own risk.

## Description

According to the configuration, the tool will try to perform a series of actions including

- Issue Denom*
- Mint NFT*
- Edit NFT*
- Burn NFT (`burn`)
- Transfer NFT (`transferTo`)

Steps marked with * will always be executed.

## Pre-requisite

- Node.js
- (Optional, Recommended) Local Crypto.org Chain node for broadcasting transaction

### Howto

```bash
$ npm install

$ cp config.js.sample config.js
# modify config.js according to your configuration

# you can use `generate-mnemonic.js` to generate the credentials
$ node generate-mnemonic.js

# Run the script as normal
$ node index.js

# Run the script and auto-retry
$ ./run-auto-retry.sh
```
