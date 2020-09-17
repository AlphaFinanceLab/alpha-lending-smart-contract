const BandPriceOracle = artifacts.require("BandPriceOracle");
const poolConfigData = require("./config/develop_pool_config.json");

const MockBNBToken = artifacts.require("BNBToken");
const MockBUSDToken = artifacts.require("BUSDToken");
const MockBTCToken = artifacts.require("BTCToken");

module.exports = (deployer, network, accounts) => {
  if (network !== "bscdevelop") return;
  deployer.then(async () => {
    const aggregatorAddress = "0x020EdB075571f0Cd3887Fbd52867A8DC9854c4cC";
    let tokenAddresses = {};
    tokenAddresses["BNB"] = (await MockBNBToken.deployed()).address;
    tokenAddresses["BUSD"] = (await MockBUSDToken.deployed()).address;
    tokenAddresses["BTC"] = (await MockBTCToken.deployed()).address;

    await deployer.deploy(BandPriceOracle, aggregatorAddress);
    const bandOracle = await BandPriceOracle.deployed();
    for (const key of Object.keys(poolConfigData)) {
      const token = poolConfigData[key];
      await bandOracle.setTokenPairMap(tokenAddresses[key], token.pair);
    }
  });
};
