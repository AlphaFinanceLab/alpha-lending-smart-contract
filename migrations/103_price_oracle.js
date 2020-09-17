const BandPriceOracle = artifacts.require("BandPriceOracle");
const poolConfigData = require("./config/testnet_pool_config.json");

module.exports = (deployer, network, accounts) => {
  if (network !== "bsctestnet") return;
  deployer.then(async () => {
    const aggregatorAddress = "0x020EdB075571f0Cd3887Fbd52867A8DC9854c4cC";

    // Binance smart chain testnet token
    let tokenAddresses = {};
    tokenAddresses["BNB"] = "0xae13d989dac2f0debff460ac112a837c89baa7cd"; // wrapped BNB
    tokenAddresses["BUSD"] = "0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee";
    tokenAddresses["BTC"] = "0x6ce8dA28E2f864420840cF74474eFf5fD80E65B8";

    await deployer.deploy(BandPriceOracle, aggregatorAddress);
    const bandOracle = await BandPriceOracle.deployed();
    for (const key of Object.keys(poolConfigData)) {
      const token = poolConfigData[key];
      await bandOracle.setTokenPairMap(tokenAddresses[key], token.pair);
    }
  });
};
