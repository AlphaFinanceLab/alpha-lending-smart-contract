const BandPriceOracle = artifacts.require("BandPriceOracle");
const poolConfigData = require("./config/develop_pool_config.json");

const MockBNBToken = artifacts.require("BNBToken");
const MockBUSDToken = artifacts.require("BUSDToken");
const MockBTCToken = artifacts.require("BTCToken");

module.exports = (deployer, network, accounts) => {
  if (network !== "bscdevelop") return;
  deployer.then(async () => {
    const stdReferenceAddress = "0x2d12c12d17fbc9185d75baf216164130fc269ff1";
    let tokenAddresses = {};
    tokenAddresses["WBNB"] = (await MockBNBToken.deployed()).address;
    tokenAddresses["BUSD"] = (await MockBUSDToken.deployed()).address;
    tokenAddresses["BTCB"] = (await MockBTCToken.deployed()).address;

    await deployer.deploy(BandPriceOracle, stdReferenceAddress);
    const bandOracle = await BandPriceOracle.deployed();
    for (const key of Object.keys(poolConfigData)) {
      const token = poolConfigData[key];
      await bandOracle.setTokenPairMap(tokenAddresses[key], token.pair);
    }
  });
};
