const { CroSDK, HDKey, Secp256k1KeyPair } = require("@crypto-com/chain-jslib");
const cro = CroSDK({
    network: {
        defaultNodeUrl: 'https://testnet-croeseid-3.crypto.org',
        chainId: 'testnet-croeseid-3',
        addressPrefix: 'tcro',
        validatorAddressPrefix: 'tcrocncl',
        validatorPubKeyPrefix: 'tcrocnclconspub',
        coin: {
            baseDenom: 'basetcro',
            croDenom: 'tcro',
        },
        bip44Path: {
            coinType: 1,
            account: 0,
        },
        rpcUrl: 'https://testnet-croeseid-3.crypto.org:26657',
    },
});

const mnemonic = HDKey.generateMnemonic();
const keyPair = Secp256k1KeyPair.fromPrivKey(HDKey.fromMnemonic(mnemonic).derivePrivKey("m/44'/1'/0'/0/0"));
const address = new cro.Address(keyPair.getPubKey()).account();

console.log(mnemonic);
console.log(address);