const AlTokenDeployer = artifacts.require("AlTokenDeployer");
const BandPriceOracle = artifacts.require("BandPriceOracle");
const LendingPool = artifacts.require("LendingPool");
const PoolConfiguration = artifacts.require("PoolConfiguration");
const poolConfigData = require("./config/testnet_pool_config.json");

module.exports = async (deployer, network, accounts) => {
  if (network !== "bsctestnet") return;

  const poolStatus = {
    INACTIVE: 0,
    ACTIVE: 1,
    CLOSED: 2,
  };

  deployer.then(async () => {
    await deployer.deploy(AlTokenDeployer);
    const alTokenDeployer = await AlTokenDeployer.deployed();

    await deployer.deploy(LendingPool, alTokenDeployer.address);
    const lendingPool = await LendingPool.deployed();

    const bandOracle = await BandPriceOracle.deployed();
    await lendingPool.setPriceOracle(bandOracle.address);
    await lendingPool.setReservePercent("100000000000000000");
    let tokenAddresses = {};
    tokenAddresses["WBNB"] = "0xae13d989dac2f0debff460ac112a837c89baa7cd";
    tokenAddresses["BUSD"] = "0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee";
    tokenAddresses["BTCB"] = "0x6ce8dA28E2f864420840cF74474eFf5fD80E65B8";

    for (const key of Object.keys(poolConfigData)) {
      const token = poolConfigData[key];
      await deployer.deploy(
        PoolConfiguration,
        token.baseBorrowRate,
        token.rateSlope1,
        token.rateSlope2,
        token.collateralPercent,
        token.liquidationBonus,
        token.optimalUtilizationRate,
        token.excessUtilizationRate
      );
      const poolConfig = await PoolConfiguration.deployed();
      await lendingPool.initPool(tokenAddresses[key], poolConfig.address);
      await lendingPool.setPoolStatus(tokenAddresses[key], poolStatus.ACTIVE);
    }
  });
};
