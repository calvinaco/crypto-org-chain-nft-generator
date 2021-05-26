const { CroSDK, CroNetwork, HDKey, Secp256k1KeyPair, Units, utils } = require("@crypto-com/chain-jslib");
// const crypto = require("crypto");
const { v4: uuidv4 } = require('uuid');
const { default: axios } = require("axios");
const randomWords = require('random-words');
const txtgen = require("txtgen"); 
const { DENOM_CONFIGS, TOTAL_NFT, BROADCAST_MODE, MAX_BROADCAST_IN_PROGRESS, NETWORK } = require("./config");

(async() => {
    const cro = CroSDK({
        network: NETWORK
    });
    const genTx = (messages, mutDenom) => {
        let rawTx = new cro.RawTransaction()
        const feeAmount = new cro.Coin("2500", Units.BASE);
        rawTx.setGasLimit("100000");
        rawTx.setFee(feeAmount);
        messages.forEach(message => {
            rawTx = rawTx.appendMessage(message)
        })

        const accountSequence = mutDenom.accountSequence;
        const signableTx = rawTx
            .addSigner({
                publicKey: mutDenom.keyPair.getPubKey(),
                accountNumber: utils.Big(mutDenom.accountNumber),
                accountSequence: utils.Big(accountSequence),
            })
            .toSignable();
        mutDenom.accountSequence += 1;
        return {
            signedTx: signableTx
                .setSignature(0, mutDenom.keyPair.sign(signableTx.toSignDoc(0)))
                .toSigned(),
            accountSequence,
        };
    }
    const broadcastTxCommit = async (tx) => {
        let resp
        try {
            resp = await axios.get(`${NETWORK.rpcUrl}/broadcast_tx_commit?tx=0x${tx.signedTx.encode().toHexString()}`);
        } catch(err) {
            if (err.response) {
                console.error(`${err.response.status} ${err.response.statusText} ${JSON.stringify(err.response.data)}`);
            }
            throw new Error(`Error broadcasting transaction: [${tx.accountSequence}]${tx.signedTx.toHexString()}`);
        }
        if (resp.data.result.deliver_tx.code !== 0) {
            console.log(JSON.stringify(resp.data));
            throw new Error(`Error broadcasting transaction: Non-zero error`);
        }
        return resp;
    }
    const broadcastTxAsync = async (tx) => {
        let resp
        try {
            resp = await axios.get(`${NETWORK.rpcUrl}/broadcast_tx_async?tx=0x${tx.signedTx.encode().toHexString()}`);
        } catch(err) {
            if (err.response) {
                console.error(`${err.response.status} ${err.response.statusText} ${JSON.stringify(err.response.data)}`);
            }
            throw new Error(`Error broadcasting transaction: [${tx.accountSequence}]${tx.signedTx.toHexString()}`);
        }
        if (resp.data.result.code !== 0) {
            console.log(JSON.stringify(resp.data));
            throw new Error(`Error broadcasting transaction: Non-zero error`);
        }
        return resp;
    }
    const broadcastTxSync = async (tx) => {
        let resp
        try {
            resp = await axios.get(`${NETWORK.rpcUrl}/broadcast_tx_sync?tx=0x${tx.signedTx.encode().toHexString()}`);
        } catch(err) {
            if (err.response) {
                console.error(`${err.response.status} ${err.response.statusText} [${tx.accountSequence}]${JSON.stringify(err.response.data)}`);
            }
            console.error(err);
            process.exit(1);
            // throw new Error(`Error broadcasting transaction: ${tx.signedTx.toHexString()}`);
        }
        if (resp.data.result.code !== 0) {
            console.log(`[${tx.accountSequence}]${JSON.stringify(resp.data)}`);
            process.exit(1);
            // throw new Error(`Error broadcasting transaction: Non-zero error`);
        }
        return resp;
    }
    const client = await cro.CroClient.connect();
    const denoms = [];

    for (let i=0, l=DENOM_CONFIGS.length; i<l; i+=1) {
        const config = DENOM_CONFIGS[i];
        const keyPair = Secp256k1KeyPair.fromPrivKey(HDKey.fromMnemonic(config.mnemonic).derivePrivKey(`m/44'/${NETWORK.bip44Path.coinType}'/0'/0/0`));
        const address = new cro.Address(keyPair.getPubKey()).account();
        const account = await client.getAccount(address);
        if (account === null) {
            console.error(`Account not found: ${address}`);
            process.exit(1);
        }
        const name = randomWords(3).join("");

        denoms.push({
            // id: `h${crypto.createHash("sha256").update(name).digest("hex")}`,
            id: `uuid-${uuidv4()}`.replace(/-/g, ""),
            name,
            drop: config.drop,
            mnemonic: config.mnemonic,
            image: config.image,
            transferTo: config.transferTo,
            burn: config.burn,
            keyPair,
            address,
            accountNumber: account.accountNumber,
            accountSequence: account.sequence,
            edition: 1,
        });
    }
    const walletQueues = DENOM_CONFIGS.map(() => []);
    for (let i=0, l=walletQueues.length; i<l; i+=1) {
        const denom = denoms[i];
        const msgIssueDenom = new cro.nft.MsgIssueDenom({
            id: denom.id,
            name: denom.name,
            schema: txtgen.paragraph(),
            sender: denom.address,
        });
        const tx = genTx([msgIssueDenom], denom);
        await broadcastTxCommit(tx);
        console.log(`[Issue] Successfully issued denom: ${denom.id} - ${denom.name}`);
    }

    for (let i=0, l=walletQueues.length; i<l; i+=1) {
        (async() => {
            // worker

            // wait for 5s so that some tx are prepared
            await new Promise(resolve => setTimeout(resolve, 5000));

            let broadcastCount = 0

            while(true) {
                const txJob = walletQueues[i].shift();
                if (!txJob) {
                    console.log(`Wallet${i}: No job to run`)
                    await new Promise(resolve => setImmediate(resolve));
                    continue
                }
                if (txJob === "ENDED") {
                    break;
                }

                try {
                    console.log(`Wallet${i}: Broadcasting transaction ${txJob.type}`)
                    switch(BROADCAST_MODE.toLowerCase()) {
                        case "commit": 
                            await broadcastTxCommit(txJob.tx);
                            break;
                        case "async":
                            await broadcastTxAsync(txJob.tx);
                            break;
                        case "sync":
                            await broadcastTxSync(txJob.tx);
                            break;
                        default:
                            console.error(`Unknown broadcast mode: ${BROADCAST_MODE}`);
                            process.exit(1);
                    }
                    broadcastCount += 1;
                    if (broadcastCount === MAX_BROADCAST_IN_PROGRESS) {
                        // take a break
                        await new Promise(resolve => setTimeout(resolve, 5000));
                        broadcastCount = 0;
                    }
                    console.log(`[${txJob.type}] Successfully broadcasted NFT transaction: [${txJob.tx.accountSequence}]${JSON.stringify(txJob.params)} 0x${txJob.tx.signedTx.getHexEncoded()} ${txJob.tx.signedTx.getTxHash()}`)
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch(err) {
                    console.error(err);
                }
            }
        })();
    }

    // producer
    let currentDenomIndex = 0;
    for (let i=0; i<TOTAL_NFT; i+=1) {
        console.log(`[Wallet${currentDenomIndex}: Generating ${i} NFT`);

        const currentDenom = denoms[currentDenomIndex];
        const currentWalletQueue = walletQueues[currentDenomIndex];
        currentDenomIndex += 1;
        if (currentDenomIndex === DENOM_CONFIGS.length) {
            currentDenomIndex = 0;
        }

        const name = randomWords(3).join("");
        const msgMintNFTParams = {
            id: `edition${currentDenom.edition}`,
            denomId: currentDenom.id,
            name,
            uri: "",
            data: JSON.stringify({
                name,
                description: txtgen.paragraph(),
                image: currentDenom.image,
                mimeType: "image/jpg",
                drop: currentDenom.drop,
            }),
            sender: currentDenom.address,
            recipient: currentDenom.address,
        };
        currentDenom.edition+=1;

        const msgMintNFT = new cro.nft.MsgMintNFT(msgMintNFTParams);
        currentWalletQueue.push({
            tx: genTx([msgMintNFT], currentDenom),
            type: 'MsgMintNFT',
            params: msgMintNFTParams
        });

        const msgEditNFTParams = {
            id: msgMintNFTParams.id,
            denomId: currentDenom.id,
            name: randomWords(3).join(" "),
            uri: "",
            data: JSON.stringify({
                name: randomWords(),
                description: txtgen.paragraph(),
                image: currentDenom.image,
                mimeType: "image/jpg",
                drop: currentDenom.drop,
            }),
            sender: currentDenom.address,
        };
        const msgEditNFT = new cro.nft.MsgEditNFT(msgEditNFTParams);
        currentWalletQueue.push({
            tx: genTx([msgEditNFT], currentDenom),
            type: 'MsgEditNFT',
            params: msgEditNFTParams
        });

        if (currentDenom.burn) {
            const msgBurnNFTParams = {
                id: msgMintNFTParams.id,
                denomId: currentDenom.id,
                sender: currentDenom.address,
            };
            const msgBurnNFT = new cro.nft.MsgBurnNFT(msgBurnNFTParams);
            currentWalletQueue.push({
                tx: genTx([msgBurnNFT], currentDenom),
                type: 'MsgBurnNFT',
                params: msgBurnNFTParams
            });
        } else if (currentDenom.transferTo) {
            const msgTransferNFTParams = {
                id: msgMintNFTParams.id,
                denomId: currentDenom.id,
                sender: currentDenom.address,
                recipient: currentDenom.transferTo,
            };
            const msgTransferNFT = new cro.nft.MsgTransferNFT(msgTransferNFTParams);
            currentWalletQueue.push({
                tx: genTx([msgTransferNFT], currentDenom),
                type: 'MsgTransferNFT',
                params: msgTransferNFTParams
            });
        }

        await new Promise(resolve => setImmediate(resolve));
    }

    for (let i=0, l=DENOM_CONFIGS.length; i<l; i+=1) {
        walletQueues[i].push("ENDED");
    }
})();