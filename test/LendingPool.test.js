const LendingPool = artifacts.require("./LendingPool.sol");
const AlToken = artifacts.require("./AlToken.sol");
const AlTokenDeployer = artifacts.require("./AlTokenDeployer.sol");
const AlphaDistributor = artifacts.require("AlphaDistributor.sol");
const DefaultPoolConfiguration = artifacts.require("./DefaultPoolConfiguration.sol");
const AlphaToken = artifacts.require("./distribution/AlphaToken");
const BNBToken = artifacts.require("./mock/BNBToken.sol");
const truffleAssert = require("truffle-assertions");
const BigNumber = require("bignumber.js");
const {WAD} = require("./helper.js");
const chai = require("chai");
const {expect, assert} = require("chai");

contract("LendingPool", (accounts) => {
  const [creator, alice, bob] = accounts;

  const BASE_BORROW_RATE = BigNumber(0.1).times(WAD); // 10%
  const SLOPE1_RATE = BigNumber(0.2).times(WAD); // 20%
  const SLOPE2_RATE = BigNumber(0.4).times(WAD); // 40%
  const COLLATERAL_PERCENT = BigNumber(0.75).times(WAD); // 75%
  const LIQUIDATION_BONUS = BigNumber(1.05).times(WAD); // 105%

  let lendingInstance;
  let bnbToken;
  let defaultPoolConfig;

  beforeEach(async () => {
    alTokenDeployer = await AlTokenDeployer.new();
    lendingInstance = await LendingPool.new(alTokenDeployer.address);
    bnbToken = await BNBToken.new();
    defaultPoolConfig = await DefaultPoolConfiguration.new(
      BASE_BORROW_RATE,
      SLOPE1_RATE,
      SLOPE2_RATE,
      COLLATERAL_PERCENT,
      LIQUIDATION_BONUS
    );
  });

  it(`Should init pool`, async () => {
    const tx = await lendingInstance.initPool(bnbToken.address, defaultPoolConfig.address, {
      from: creator,
    });
    const poolData = await lendingInstance.getPool(bnbToken.address);

    // check emitted event
    truffleAssert.eventEmitted(
      tx,
      "PoolInitialized",
      (ev) => {
        return (
          ev.pool === bnbToken.address &&
          ev.alTokenAddress === poolData.alTokenAddress &&
          ev.poolConfigAddress === defaultPoolConfig.address
        );
      },
      "PoolInitialized event should be emitted with correct parameters"
    );

    // check state on contract
    const expectTotalBorrows = 0;
    const expectTotalBorrowShares = 0;
    const expectTotalLiquidity = 0;
    const expectTotalAvailableLiquidity = 0;
    const expectedAlTokenName = "AlBNB";
    const expectedAlTokenSymbol = "alBNB";

    alToken = await AlToken.at(poolData.alTokenAddress);
    const actualAlTokenName = await alToken.name();
    const actualAlTokenSymbol = await alToken.symbol();
    assert.equal(expectedAlTokenName, actualAlTokenName);
    assert.equal(expectedAlTokenSymbol, actualAlTokenSymbol);

    assert.equal(defaultPoolConfig.address, poolData.poolConfigAddress);
    assert.equal(expectTotalBorrows, poolData.totalBorrows.toString());
    assert.equal(expectTotalBorrowShares, poolData.totalBorrowShares.toString());
    assert.equal(expectTotalLiquidity, poolData.totalLiquidity.toString());
    assert.equal(expectTotalAvailableLiquidity, poolData.totalAvailableLiquidity.toString());
  });

  it(`Shouldn't be able to set pool config if pool isn't initialized`, async () => {
    const bnbPoolConfig = await DefaultPoolConfiguration.new(
      BASE_BORROW_RATE,
      SLOPE1_RATE,
      SLOPE2_RATE,
      COLLATERAL_PERCENT,
      LIQUIDATION_BONUS
    );

    await truffleAssert.reverts(
      lendingInstance.setPoolConfig(bnbToken.address, bnbPoolConfig.address),
      "pool isn't initialized, can't set the pool config"
    );
  });

  it(`Shouldn't be able to set pool reserve percent if user isn't an admin`, async () => {
    const defaultReservePercent = BigNumber(0.05).times(WAD);
    const reservePercent = BigNumber(10).times(WAD);

    await truffleAssert.reverts(
      lendingInstance.setReservePercent(reservePercent, {from: bob}),
      "Ownable: caller is not the owner"
    );

    const poolReservePercent = await lendingInstance.reservePercent();
    expect(BigNumber(poolReservePercent)).to.be.bignumber.eq(
      BigNumber(defaultReservePercent),
      "Invalid pool reserve percent"
    );
  });

  it(`Should set reserve percent by admin`, async () => {
    const defaultReservePercent = BigNumber(0.05).times(WAD);
    const expectedReservePercent = BigNumber(0.1).times(WAD);
    const tx = await lendingInstance.setReservePercent(expectedReservePercent, {from: creator});
    truffleAssert.eventEmitted(
      tx,
      "ReservePercentUpdated",
      (ev) => {
        return (
          ev.previousReservePercent.toString() === defaultReservePercent.toString() &&
          ev.newReservePercent.toString() === expectedReservePercent.toString()
        );
      },
      "ReservePercentUpdated event should be emitted with correct parameters"
    );
    const poolReservePercent = await lendingInstance.reservePercent();
    expect(BigNumber(poolReservePercent)).to.be.bignumber.eq(
      BigNumber(expectedReservePercent),
      "Invalid pool reserve percent"
    );
  });
});
