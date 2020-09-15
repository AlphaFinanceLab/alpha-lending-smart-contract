const LendingPool = artifacts.require("LendingPool");
const DefaultPoolConfiguration = artifacts.require("DefaultPoolConfiguration");
const poolConfigData = require("./pool_config.json");

module.exports = async (deployer, network, accounts) => {
  if (network === "development" || network === "test") return;

  deployer.then(async () => {

    const lendingPool = await LendingPool.at("0xD16556587EF21d3D7e8ea794FFED3D83Aa8BdCeA");
    let tokenAddresses = {};
    tokenAddresses["BNB"] = "0x15a5d90DE41DE0621DC2610D123Ba77E207a1541";
    tokenAddresses["BUSD"] = "0x5D629Eb30256ED5a250B1040FD302155b4Bc4369";
    tokenAddresses["BTC"] = "0xDB61DBc3e5ABeb0bF84eF9Bd8bBaE2A67091fCa9";

    for (const key of Object.keys(poolConfigData)) {
      const token = poolConfigData[key];
      await deployer.deploy(
        DefaultPoolConfiguration,
        token.baseBorrowRate,
        token.rateSlope1,
        token.rateSlope2,
        token.collateralPercent,
        token.liquidationBonus
      );
      const poolConfig = await DefaultPoolConfiguration.deployed();
      await lendingPool.setPoolConfig(tokenAddresses[key], poolConfig.address);
    }
  })
}