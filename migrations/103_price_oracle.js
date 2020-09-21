const BandPriceOracle = artifacts.require("BandPriceOracle");
const poolConfigData = require("./config/testnet_pool_config.json");

module.exports = (deployer, network, accounts) => {
  if (network !== "bsctestnet") return;
  deployer.then(async () => {
    const stdReferenceAddress = "0x2d12c12d17fbc9185d75baf216164130fc269ff1";

    // Binance smart chain testnet token
    let tokenAddresses = {};
    tokenAddresses["WBNB"] = "0xae13d989dac2f0debff460ac112a837c89baa7cd"; // wrapped BNB
    tokenAddresses["BUSD"] = "0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee";
    tokenAddresses["BTCB"] = "0x6ce8dA28E2f864420840cF74474eFf5fD80E65B8";

    await deployer.deploy(BandPriceOracle, stdReferenceAddress);
    const bandOracle = await BandPriceOracle.deployed();
    for (const key of Object.keys(poolConfigData)) {
      const token = poolConfigData[key];
      await bandOracle.setTokenPairMap(tokenAddresses[key], token.pair);
    }
  });
};
