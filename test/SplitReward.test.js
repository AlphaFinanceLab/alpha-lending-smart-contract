const AlTokenDeployer = artifacts.require("./AlTokenDeployer.sol");
const MockLendingPoolLight = artifacts.require("./MockLendingPoolLight.sol");
const DefaultPoolConfiguration = artifacts.require("./DefaultPoolConfiguration.sol");
const DAIPoolConfiguration = artifacts.require("./mock/DaiPoolConfiguration.sol");
const BNBToken = artifacts.require("./mock/BNBToken.sol");
const DAIToken = artifacts.require("./mock/DAIToken.sol");
const BigNumber = require("bignumber.js");
const chai = require("chai");
const {WAD} = require("./helper.js");
const {expect, assert} = require("chai");
chai.use(require("chai-bignumber")(BigNumber));

contract("Split Reward", (accounts) => {
  const [creator, alice, bob] = accounts;

  const BASE_BORROW_RATE = BigNumber(0.1).times(WAD); // 10%
  const SLOPE1_RATE = BigNumber(0.2).times(WAD); // 20%
  const SLOPE2_RATE = BigNumber(0.4).times(WAD); // 40%
  const MAX_LTV = BigNumber(0.75).times(WAD); // 75%
  const LIQUIDATION_BONUS = BigNumber(1.05).times(WAD); // 105%
  const POOL_RESERVE = BigNumber(1).times(WAD);

  // BNB
  let bnbToken;

  // DAI
  let daiToken;

  beforeEach(async () => {
    alTokenDeployer = await AlTokenDeployer.new();
    lendingInstance = await MockLendingPoolLight.new(alTokenDeployer.address);

    // 80% optimal utilization rate
    const bnbPoolConfigInstance = await DefaultPoolConfiguration.new(
      BASE_BORROW_RATE,
      SLOPE1_RATE,
      SLOPE2_RATE,
      MAX_LTV,
      LIQUIDATION_BONUS
    );

    // set up BNB token pool
    bnbToken = await BNBToken.new();
    await lendingInstance.initPool(bnbToken.address, bnbPoolConfigInstance.address, {
      from: creator,
    });

    // 40% optimal utilization rate
    daiPoolConfigInstance = await DAIPoolConfiguration.new(
      BASE_BORROW_RATE,
      SLOPE1_RATE,
      SLOPE2_RATE,
      MAX_LTV,
      LIQUIDATION_BONUS
    );

    // set up BNB token pool
    daiToken = await DAIToken.new();
    await lendingInstance.initPool(daiToken.address, daiPoolConfigInstance.address, {
      from: creator,
    });
  });

  it(`Should split reward to lenders and borrowwers correctly (optimal: 80%, utilization: 0%)`, async () => {
    const portion = BigNumber(10).times(WAD);
    const pool = {
      tokenInstance: bnbToken,
      totalAvailableLiquidity: BigNumber(101).times(WAD),
      totalLiquidityShares: BigNumber(100).times(WAD),
      totalBorrows: BigNumber(0).times(WAD),
      totalBorrowShares: BigNumber(100).times(WAD),
    };

    await pool.tokenInstance.mint(lendingInstance.address, pool.totalAvailableLiquidity);

    // mock total supply of alToken
    await lendingInstance.mintAlToken(
      pool.tokenInstance.address,
      lendingInstance.address,
      pool.totalLiquidityShares
    );
    await lendingInstance.setPool(
      pool.tokenInstance.address,
      pool.totalBorrows,
      pool.totalBorrowShares
    );

    await lendingInstance.setPoolReserves(bnbToken.address, POOL_RESERVE);

    const result = await lendingInstance.splitRewardExternal(bnbToken.address, portion);
    // 0% of portion (10*10^18)
    expect(BigNumber(result.lendersGain)).to.be.bignumber.eq(
      BigNumber(0).times(WAD),
      "Invalid alpha gain"
    );
    // 100% of portion (10*10^18)
    expect(BigNumber(result.borrowersGain)).to.be.bignumber.eq(
      BigNumber(10).times(WAD),
      "Invalid alpha gain"
    );
  });

  it(`Should split reward to lenders and borrowwers correctly (optimal: 80%, utilization: 20%)`, async () => {
    const portion = BigNumber(10).times(WAD);
    const pool = {
      tokenInstance: bnbToken,
      totalAvailableLiquidity: BigNumber(81).times(WAD),
      totalLiquidityShares: BigNumber(100).times(WAD),
      totalBorrows: BigNumber(20).times(WAD),
      totalBorrowShares: BigNumber(100).times(WAD),
    };

    await pool.tokenInstance.mint(lendingInstance.address, pool.totalAvailableLiquidity);

    // mock total supply of alToken
    await lendingInstance.mintAlToken(
      pool.tokenInstance.address,
      lendingInstance.address,
      pool.totalLiquidityShares
    );
    await lendingInstance.setPool(
      pool.tokenInstance.address,
      pool.totalBorrows,
      pool.totalBorrowShares
    );

    await lendingInstance.setPoolReserves(bnbToken.address, POOL_RESERVE);

    const result = await lendingInstance.splitRewardExternal(bnbToken.address, portion);
    expect(BigNumber(result.lendersGain)).to.be.bignumber.eq(
      BigNumber(1.25).times(WAD),
      "Invalid alpha gain"
    );

    expect(BigNumber(result.borrowersGain)).to.be.bignumber.eq(
      BigNumber(8.75).times(WAD),
      "Invalid alpha gain"
    );
  });

  it(`Should split reward to lenders and borrowwers correctly (optimal: 80%, utilization: 80%)`, async () => {
    const portion = BigNumber(10).times(WAD);
    const pool = {
      tokenInstance: bnbToken,
      totalAvailableLiquidity: BigNumber(21).times(WAD),
      totalLiquidityShares: BigNumber(100).times(WAD),
      totalBorrows: BigNumber(80).times(WAD),
      totalBorrowShares: BigNumber(100).times(WAD),
    };

    await pool.tokenInstance.mint(lendingInstance.address, pool.totalAvailableLiquidity);

    // mock total supply of alToken
    await lendingInstance.mintAlToken(
      pool.tokenInstance.address,
      lendingInstance.address,
      pool.totalLiquidityShares
    );
    await lendingInstance.setPool(
      pool.tokenInstance.address,
      pool.totalBorrows,
      pool.totalBorrowShares
    );

    await lendingInstance.setPoolReserves(bnbToken.address, POOL_RESERVE);

    const result = await lendingInstance.splitRewardExternal(bnbToken.address, portion);
    // 50% of portion (10*10^18)
    expect(BigNumber(result.lendersGain)).to.be.bignumber.eq(
      BigNumber(5).times(WAD),
      "Invalid alpha gain"
    );
    // 50% of portion (10*10^18)
    expect(BigNumber(result.borrowersGain)).to.be.bignumber.eq(
      BigNumber(5).times(WAD),
      "Invalid alpha gain"
    );
  });

  it(`Should split reward to lenders and borrowwers correctly (optimal: 80%, utilization: 90%)`, async () => {
    const portion = BigNumber(10).times(WAD);
    const pool = {
      tokenInstance: bnbToken,
      totalAvailableLiquidity: BigNumber(11).times(WAD),
      totalLiquidityShares: BigNumber(100).times(WAD),
      totalBorrows: BigNumber(90).times(WAD),
      totalBorrowShares: BigNumber(100).times(WAD),
    };

    await pool.tokenInstance.mint(lendingInstance.address, pool.totalAvailableLiquidity);

    // mock total supply of alToken
    await lendingInstance.mintAlToken(
      pool.tokenInstance.address,
      lendingInstance.address,
      pool.totalLiquidityShares
    );
    await lendingInstance.setPool(
      pool.tokenInstance.address,
      pool.totalBorrows,
      pool.totalBorrowShares
    );

    await lendingInstance.setPoolReserves(bnbToken.address, POOL_RESERVE);

    const result = await lendingInstance.splitRewardExternal(bnbToken.address, portion);
    // 75% of portion (10*10^18)
    expect(BigNumber(result.lendersGain)).to.be.bignumber.eq(
      BigNumber(7.5).times(WAD),
      "Invalid alpha gain"
    );

    // 25% of portion (10*10^18)
    expect(BigNumber(result.borrowersGain)).to.be.bignumber.eq(
      BigNumber(2.5).times(WAD),
      "Invalid alpha gain"
    );
  });

  it(`Should split reward to lenders and borrowwers correctly (optimal: 80%, utilization: 100%)`, async () => {
    const portion = BigNumber(10).times(WAD);
    const pool = {
      tokenInstance: bnbToken,
      totalAvailableLiquidity: BigNumber(1).times(WAD),
      totalLiquidityShares: BigNumber(100).times(WAD),
      totalBorrows: BigNumber(100).times(WAD),
      totalBorrowShares: BigNumber(100).times(WAD),
    };

    await pool.tokenInstance.mint(lendingInstance.address, pool.totalAvailableLiquidity);

    // mock total supply of alToken
    await lendingInstance.mintAlToken(
      pool.tokenInstance.address,
      lendingInstance.address,
      pool.totalLiquidityShares
    );
    await lendingInstance.setPool(
      pool.tokenInstance.address,
      pool.totalBorrows,
      pool.totalBorrowShares
    );

    await lendingInstance.setPoolReserves(bnbToken.address, POOL_RESERVE);

    const result = await lendingInstance.splitRewardExternal(bnbToken.address, portion);
    // 100% of portion (10*10^18)
    expect(BigNumber(result.lendersGain)).to.be.bignumber.eq(
      BigNumber(10).times(WAD),
      "Invalid alpha gain"
    );

    // 0% of portion (10*10^18)
    expect(BigNumber(result.borrowersGain)).to.be.bignumber.eq(
      BigNumber(0).times(WAD),
      "Invalid alpha gain"
    );
  });

  it(`Should split reward to lenders and borrowwers correctly (optimal: 40%, utilization: 0%)`, async () => {
    const portion = BigNumber(10).times(WAD);
    const pool = {
      tokenInstance: daiToken,
      totalAvailableLiquidity: BigNumber(101).times(WAD),
      totalLiquidityShares: BigNumber(100).times(WAD),
      totalBorrows: BigNumber(0).times(WAD),
      totalBorrowShares: BigNumber(100).times(WAD),
    };

    await pool.tokenInstance.mint(lendingInstance.address, pool.totalAvailableLiquidity);

    // mock total supply of alToken
    await lendingInstance.mintAlToken(
      pool.tokenInstance.address,
      lendingInstance.address,
      pool.totalLiquidityShares
    );
    await lendingInstance.setPool(
      pool.tokenInstance.address,
      pool.totalBorrows,
      pool.totalBorrowShares
    );

    await lendingInstance.setPoolReserves(daiToken.address, POOL_RESERVE);

    const result = await lendingInstance.splitRewardExternal(daiToken.address, portion);
    // 0% of portion (10*10^18)
    expect(BigNumber(result.lendersGain)).to.be.bignumber.eq(
      BigNumber(0).times(WAD),
      "Invalid alpha gain"
    );

    // 100% of portion (10*10^18)
    expect(BigNumber(result.borrowersGain)).to.be.bignumber.eq(
      BigNumber(10).times(WAD),
      "Invalid alpha gain"
    );
  });

  it(`Should split reward to lenders and borrowwers correctly (optimal: 40%, utilization: 20%)`, async () => {
    const portion = BigNumber(10).times(WAD);
    const pool = {
      tokenInstance: daiToken,
      totalAvailableLiquidity: BigNumber(81).times(WAD),
      totalLiquidityShares: BigNumber(100).times(WAD),
      totalBorrows: BigNumber(20).times(WAD),
      totalBorrowShares: BigNumber(100).times(WAD),
    };

    await pool.tokenInstance.mint(lendingInstance.address, pool.totalAvailableLiquidity);

    // mock total supply of alToken
    await lendingInstance.mintAlToken(
      pool.tokenInstance.address,
      lendingInstance.address,
      pool.totalLiquidityShares
    );
    await lendingInstance.setPool(
      pool.tokenInstance.address,
      pool.totalBorrows,
      pool.totalBorrowShares
    );

    await lendingInstance.setPoolReserves(daiToken.address, POOL_RESERVE);

    const result = await lendingInstance.splitRewardExternal(daiToken.address, portion);
    // 25% of portion (10*10^18)
    expect(BigNumber(result.lendersGain)).to.be.bignumber.eq(
      BigNumber(2.5).times(WAD),
      "Invalid alpha gain"
    );

    // 75% of portion (10*10^18)
    expect(BigNumber(result.borrowersGain)).to.be.bignumber.eq(
      BigNumber(7.5).times(WAD),
      "Invalid alpha gain"
    );
  });

  it(`Should split reward to lenders and borrowwers correctly (optimal: 40%, utilization: 40%)`, async () => {
    const portion = BigNumber(10).times(WAD);
    const pool = {
      tokenInstance: daiToken,
      totalAvailableLiquidity: BigNumber(61).times(WAD),
      totalLiquidityShares: BigNumber(100).times(WAD),
      totalBorrows: BigNumber(40).times(WAD),
      totalBorrowShares: BigNumber(100).times(WAD),
    };

    await pool.tokenInstance.mint(lendingInstance.address, pool.totalAvailableLiquidity);

    // mock total supply of alToken
    await lendingInstance.mintAlToken(
      pool.tokenInstance.address,
      lendingInstance.address,
      pool.totalLiquidityShares
    );
    await lendingInstance.setPool(
      pool.tokenInstance.address,
      pool.totalBorrows,
      pool.totalBorrowShares
    );

    await lendingInstance.setPoolReserves(daiToken.address, POOL_RESERVE);

    const result = await lendingInstance.splitRewardExternal(daiToken.address, portion);
    // 50% of portion (10*10^18)
    expect(BigNumber(result.lendersGain)).to.be.bignumber.eq(
      BigNumber(5).times(WAD),
      "Invalid alpha gain"
    );

    // 50% of portion (10*10^18)
    expect(BigNumber(result.borrowersGain)).to.be.bignumber.eq(
      BigNumber(5).times(WAD),
      "Invalid alpha gain"
    );
  });

  it(`Should split reward to lenders and borrowwers correctly (optimal: 40%, utilization: 70%)`, async () => {
    const portion = BigNumber(10).times(WAD);
    const pool = {
      tokenInstance: daiToken,
      totalAvailableLiquidity: BigNumber(31).times(WAD),
      totalLiquidityShares: BigNumber(100).times(WAD),
      totalBorrows: BigNumber(70).times(WAD),
      totalBorrowShares: BigNumber(100).times(WAD),
    };

    await pool.tokenInstance.mint(lendingInstance.address, pool.totalAvailableLiquidity);

    // mock total supply of alToken
    await lendingInstance.mintAlToken(
      pool.tokenInstance.address,
      lendingInstance.address,
      pool.totalLiquidityShares
    );
    await lendingInstance.setPool(
      pool.tokenInstance.address,
      pool.totalBorrows,
      pool.totalBorrowShares
    );

    await lendingInstance.setPoolReserves(daiToken.address, POOL_RESERVE);

    const result = await lendingInstance.splitRewardExternal(daiToken.address, portion);
    // 75% of portion (10*10^18)
    expect(BigNumber(result.lendersGain)).to.be.bignumber.eq(
      BigNumber(7.5).times(WAD),
      "Invalid alpha gain"
    );

    // 25% of portion (10*10^18)
    expect(BigNumber(result.borrowersGain)).to.be.bignumber.eq(
      BigNumber(2.5).times(WAD),
      "Invalid alpha gain"
    );
  });

  it(`Should split reward to lenders and borrowwers correctly (optimal: 40%, utilization: 100%)`, async () => {
    const portion = BigNumber(10).times(WAD);
    const pool = {
      tokenInstance: daiToken,
      totalAvailableLiquidity: BigNumber(1).times(WAD),
      totalLiquidityShares: BigNumber(100).times(WAD),
      totalBorrows: BigNumber(100).times(WAD),
      totalBorrowShares: BigNumber(100).times(WAD),
    };

    await pool.tokenInstance.mint(lendingInstance.address, pool.totalAvailableLiquidity);

    // mock total supply of alToken
    await lendingInstance.mintAlToken(
      pool.tokenInstance.address,
      lendingInstance.address,
      pool.totalLiquidityShares
    );
    await lendingInstance.setPool(
      pool.tokenInstance.address,
      pool.totalBorrows,
      pool.totalBorrowShares
    );

    await lendingInstance.setPoolReserves(daiToken.address, POOL_RESERVE);

    const result = await lendingInstance.splitRewardExternal(daiToken.address, portion);
    // 100% of portion (10*10^18)
    expect(BigNumber(result.lendersGain)).to.be.bignumber.eq(
      BigNumber(10).times(WAD),
      "Invalid alpha gain"
    );

    // 0% of portion (10*10^18)
    expect(BigNumber(result.borrowersGain)).to.be.bignumber.eq(
      BigNumber(0).times(WAD),
      "Invalid alpha gain"
    );
  });
});
