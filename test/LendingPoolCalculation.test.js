const AlTokenDeployer = artifacts.require("./AlTokenDeployer.sol");
const MockLendingPoolCalculation = artifacts.require("./MockLendingPoolCalculation.sol");
const DefaultPoolConfiguration = artifacts.require("./DefaultPoolConfiguration.sol");
const MockPriceOracle = artifacts.require("./mock/MockPriceOracle.sol");
const BNBToken = artifacts.require("./mock/BNBToken.sol");
const BUSDToken = artifacts.require("./mock/BUSDToken.sol");
const DAIToken = artifacts.require("./mock/DAIToken.sol");
const BigNumber = require("bignumber.js");
const truffleAssert = require("truffle-assertions");
const {WAD, HALF_WAD} = require("./helper.js");
const {time} = require("@openzeppelin/test-helpers");
const chai = require("chai");
const {expect, assert} = require("chai");
chai.use(require("chai-bignumber")(BigNumber));

contract("MockLendingPoolCalculation", (accounts) => {
  const [creator, alice, bob] = accounts;

  const poolStatus = {
    INACTIVE: BigNumber(0),
    ACTIVE: BigNumber(1),
    CLOSED: BigNumber(2),
  };

  const BASE_BORROW_RATE = BigNumber(0.1).times(WAD); // 10%
  const SLOPE1_RATE = BigNumber(0.2).times(WAD); // 20%
  const SLOPE2_RATE = BigNumber(0.4).times(WAD); // 40%
  const MAX_LTV = BigNumber(0.75).times(WAD); // 75%
  const LIQUIDATION_BONUS = BigNumber(1.05).times(WAD); // 105%

  let defaultPoolConfigInstance;
  let lendingInstance;
  let priceOracleInstance;
  // BNB
  let bnbToken;
  let alBNBToken;
  const bnbPricePerUnit = BigNumber(1).times(HALF_WAD);

  // BUSD
  let busdToken;
  let alBUSDToken;
  let busdPricePerUnit = BigNumber(1).times(HALF_WAD);

  // DAI
  let daiToken;
  let alDAIToken;
  let daiPricePerUnit = BigNumber(1).times(HALF_WAD);

  beforeEach(async () => {
    alTokenDeployer = await AlTokenDeployer.new();
    lendingInstance = await MockLendingPoolCalculation.new(alTokenDeployer.address);

    defaultPoolConfigInstance = await DefaultPoolConfiguration.new(
      BASE_BORROW_RATE,
      SLOPE1_RATE,
      SLOPE2_RATE,
      MAX_LTV,
      LIQUIDATION_BONUS
    );

    // set up BNB token pool
    bnbToken = await BNBToken.new();
    await lendingInstance.initPool(bnbToken.address, defaultPoolConfigInstance.address, {
      from: creator,
    });
    const bnbPoolData = await lendingInstance.getPool(bnbToken.address);
    alBNBToken = await BNBToken.at(bnbPoolData.alTokenAddress);

    //set up BUSD token pool
    busdToken = await BUSDToken.new();
    await lendingInstance.initPool(busdToken.address, defaultPoolConfigInstance.address, {
      from: creator,
    });
    const busdPoolData = await lendingInstance.getPool(busdToken.address);
    alBUSDToken = await BUSDToken.at(busdPoolData.alTokenAddress);

    // set up Dai token pool
    daiToken = await DAIToken.new();
    await lendingInstance.initPool(daiToken.address, defaultPoolConfigInstance.address, {
      from: creator,
    });
    const daiPoolData = await lendingInstance.getPool(daiToken.address);
    alDAIToken = await DAIToken.at(daiPoolData.alTokenAddress);

    // set up price oracle
    priceOracleInstance = await MockPriceOracle.new();
    await lendingInstance.setPriceOracle(priceOracleInstance.address);
    await priceOracleInstance.setAssetPrice(bnbToken.address, bnbPricePerUnit);
    await priceOracleInstance.setAssetPrice(busdToken.address, busdPricePerUnit);
    await priceOracleInstance.setAssetPrice(daiToken.address, daiPricePerUnit);
  });

  it(`Should get the correct round down liquidity share amount (normal case)`, async () => {
    const pool = bnbToken.address;
    const totalLiquidity = BigNumber(200).times(WAD);
    const totalLiquidityShares = BigNumber(100);
    const amount = BigNumber(4).times(WAD);

    // mint liquidity to pool
    await bnbToken.mint(lendingInstance.address, totalLiquidity);

    // mock total liquidity share
    await lendingInstance.mintAlToken(pool, lendingInstance.address, totalLiquidityShares);
    const shareAmount = await lendingInstance.calculateRoundDownLiquidityShareAmountExternal(
      pool,
      amount
    );
    const expectedLiquidityShareAmount = BigNumber(2);

    expect(BigNumber(shareAmount)).to.be.bignumber.eq(
      BigNumber(expectedLiquidityShareAmount),
      "Invalid liquidity share amount"
    );
  });

  it(`Should get the correct round down liquidity share amount (round down case)`, async () => {
    const pool = bnbToken.address;
    const totalLiquidity = BigNumber(200).times(WAD);
    const totalLiquidityShares = BigNumber(100);
    const amount = BigNumber(5.8).times(WAD);

    // mint liquidity to pool
    await bnbToken.mint(lendingInstance.address, totalLiquidity);

    // mock total liquidity share
    await lendingInstance.mintAlToken(pool, lendingInstance.address, totalLiquidityShares);
    const shareAmount = await lendingInstance.calculateRoundDownLiquidityShareAmountExternal(
      pool,
      amount
    );
    const expectedLiquidityShareAmount = BigNumber(2.9).integerValue(BigNumber.ROUND_DOWN);

    expect(BigNumber(shareAmount)).to.be.bignumber.eq(
      BigNumber(expectedLiquidityShareAmount),
      "Invalid liquidity share amount"
    );
  });

  it(`Should get the correct round up liquidity share amount (normal case)`, async () => {
    const pool = bnbToken.address;
    const totalLiquidity = BigNumber(200).times(WAD);
    const totalLiquidityShares = BigNumber(100);
    const amount = BigNumber(4).times(WAD);

    // mint liquidity to pool
    await bnbToken.mint(lendingInstance.address, totalLiquidity);

    // mock total liquidity share
    await lendingInstance.mintAlToken(pool, lendingInstance.address, totalLiquidityShares);
    const shareAmount = await lendingInstance.calculateRoundUpLiquidityShareAmountExternal(
      pool,
      amount
    );
    const expectedLiquidityShareAmount = BigNumber(2);

    expect(BigNumber(shareAmount)).to.be.bignumber.eq(
      BigNumber(expectedLiquidityShareAmount),
      "Invalid liquidity share amount"
    );
  });

  it(`Should get the correct round up liquidity share amount (pool's total liquidity is less than user amount)`, async () => {
    const pool = bnbToken.address;
    const totalLiquidity = BigNumber(200).times(WAD);
    const totalLiquidityShares = BigNumber(100);
    const amount = BigNumber(255).times(WAD);

    // mint liquidity to pool
    await bnbToken.mint(lendingInstance.address, totalLiquidity);

    // mock total liquidity share
    await lendingInstance.mintAlToken(pool, lendingInstance.address, totalLiquidityShares);
    const shareAmount = await lendingInstance.calculateRoundUpLiquidityShareAmountExternal(
      pool,
      amount
    );
    const expectedLiquidityShareAmount = BigNumber(128);

    expect(BigNumber(shareAmount)).to.be.bignumber.eq(
      BigNumber(expectedLiquidityShareAmount),
      "Invalid liquidity share amount"
    );
  });

  it(`Should get the correct round up liquidity share amount (pool's total liquidity is 0)`, async () => {
    const pool = bnbToken.address;
    const totalLiquidity = BigNumber(0).times(WAD);
    const totalLiquidityShares = BigNumber(0);
    const amount = BigNumber(255).times(WAD);

    // mint liquidity to pool
    await bnbToken.mint(lendingInstance.address, totalLiquidity);

    // mock total liquidity share
    await lendingInstance.mintAlToken(pool, lendingInstance.address, totalLiquidityShares);
    const shareAmount = await lendingInstance.calculateRoundUpLiquidityShareAmountExternal(
      pool,
      amount
    );
    const expectedLiquidityShareAmount = BigNumber(255).times(WAD);

    expect(BigNumber(shareAmount)).to.be.bignumber.eq(
      BigNumber(expectedLiquidityShareAmount),
      "Invalid liquidity share amount"
    );
  });

  it(`Should get the correct round up liquidity share amount (round up case)`, async () => {
    const pool = bnbToken.address;
    const totalLiquidity = BigNumber(200).times(WAD);
    const totalLiquidityShares = BigNumber(100);
    const amount = BigNumber(5.8).times(WAD);

    // mint liquidity to pool
    await bnbToken.mint(lendingInstance.address, totalLiquidity);

    // mock total liquidity share
    await lendingInstance.mintAlToken(pool, lendingInstance.address, totalLiquidityShares);
    const shareAmount = await lendingInstance.calculateRoundUpLiquidityShareAmountExternal(
      pool,
      amount
    );
    const expectedLiquidityShareAmount = BigNumber(2.9).integerValue(BigNumber.ROUND_UP);

    expect(BigNumber(shareAmount)).to.be.bignumber.eq(
      BigNumber(expectedLiquidityShareAmount),
      "Invalid liquidity share amount"
    );
  });

  it(`Should get the correct round up borrow share amount (normal case)`, async () => {
    const pool = bnbToken.address;
    const totalBorrows = BigNumber(200).times(WAD);
    const totalBorrowShares = BigNumber(100);
    const amount = BigNumber(4).times(WAD);

    // set pool
    await lendingInstance.setPool(pool, totalBorrows, totalBorrowShares);

    const shareAmount = await lendingInstance.calculateRoundUpBorrowShareAmountExternal(
      pool,
      amount
    );
    const expectedBorrowShareAmount = BigNumber(2);

    expect(BigNumber(shareAmount)).to.be.bignumber.eq(
      BigNumber(expectedBorrowShareAmount),
      "Invalid round up borrow share amount"
    );
  });

  it(`Should get the correct round up borrow share amount (pool's total borrow is less than user amount)`, async () => {
    const pool = bnbToken.address;
    const totalBorrows = BigNumber(200).times(WAD);
    const totalBorrowShares = BigNumber(100);
    const amount = BigNumber(255).times(WAD);

    // set pool
    await lendingInstance.setPool(pool, totalBorrows, totalBorrowShares);

    const shareAmount = await lendingInstance.calculateRoundUpBorrowShareAmountExternal(
      pool,
      amount
    );
    const expectedBorrowShareAmount = BigNumber(128);

    expect(BigNumber(shareAmount)).to.be.bignumber.eq(
      BigNumber(expectedBorrowShareAmount),
      "Invalid round up borrow share amount"
    );
  });

  it(`Should get the correct round up borrow share amount (pool's total borrow is 0)`, async () => {
    const pool = bnbToken.address;
    const totalBorrows = BigNumber(0);
    const totalBorrowShares = BigNumber(0);
    const amount = BigNumber(255).times(WAD);

    // set pool
    await lendingInstance.setPool(pool, totalBorrows, totalBorrowShares);

    const shareAmount = await lendingInstance.calculateRoundUpBorrowShareAmountExternal(
      pool,
      amount
    );
    const expectedBorrowShareAmount = BigNumber(255).times(WAD);

    expect(BigNumber(shareAmount)).to.be.bignumber.eq(
      BigNumber(expectedBorrowShareAmount),
      "Invalid round up borrow share amount"
    );
  });

  it(`Should get the correct round up borrow share amount (round up case)`, async () => {
    const pool = bnbToken.address;
    const totalBorrows = BigNumber(200).times(WAD);
    const totalBorrowShares = BigNumber(100);
    const amount = BigNumber(5.8).times(WAD);

    // set pool
    await lendingInstance.setPool(pool, totalBorrows, totalBorrowShares);

    const shareAmount = await lendingInstance.calculateRoundUpBorrowShareAmountExternal(
      pool,
      amount
    );
    const expectedBorrowShareAmount = BigNumber(2.9).integerValue(BigNumber.ROUND_UP);

    expect(BigNumber(shareAmount)).to.be.bignumber.eq(
      BigNumber(expectedBorrowShareAmount),
      "Invalid round up borrow share amount"
    );
  });

  it(`Should get the correct round down borrow share amount (normal case)`, async () => {
    const pool = bnbToken.address;
    const totalBorrows = BigNumber(200).times(WAD);
    const totalBorrowShares = BigNumber(100);
    const amount = BigNumber(4).times(WAD);

    // set pool
    await lendingInstance.setPool(pool, totalBorrows, totalBorrowShares);

    const shareAmount = await lendingInstance.calculateRoundDownBorrowShareAmountExternal(
      pool,
      amount
    );
    const expectedBorrowShareAmount = BigNumber(2);

    expect(BigNumber(shareAmount)).to.be.bignumber.eq(
      BigNumber(expectedBorrowShareAmount),
      "Invalid round down borrow share amount"
    );
  });

  it(`Should get the correct round down borrow share amount (round down case)`, async () => {
    const pool = bnbToken.address;
    const totalBorrows = BigNumber(200).times(WAD);
    const totalBorrowShares = BigNumber(100);
    const amount = BigNumber(5.8).times(WAD);

    // set pool
    await lendingInstance.setPool(pool, totalBorrows, totalBorrowShares);

    const shareAmount = await lendingInstance.calculateRoundDownBorrowShareAmountExternal(
      pool,
      amount
    );
    const expectedBorrowShareAmount = BigNumber(2.9).integerValue(BigNumber.ROUND_DOWN);

    expect(BigNumber(shareAmount)).to.be.bignumber.eq(
      BigNumber(expectedBorrowShareAmount),
      "Invalid round up borrow share amount"
    );
  });

  it(`Should get the correct liquidity amount`, async () => {
    const pool = bnbToken.address;
    const totalLiquidity = BigNumber(200).times(WAD);
    const totalLiquidityShares = BigNumber(100);
    const shareAmount = BigNumber(2);

    // mint liquidity to pool
    await bnbToken.mint(lendingInstance.address, totalLiquidity);

    // mock total liquidity share
    await lendingInstance.mintAlToken(pool, lendingInstance.address, totalLiquidityShares);
    const amount = await lendingInstance.calculateRoundDownLiquidityAmountExternal(
      pool,
      shareAmount
    );

    const expectedLiquidityAmount = BigNumber(4).times(WAD);
    expect(BigNumber(amount)).to.be.bignumber.eq(
      BigNumber(expectedLiquidityAmount),
      "Invalid liquidity amount"
    );
  });

  it(`Should get the correct round up borrow amount (normal case)`, async () => {
    const pool = bnbToken.address;
    const totalBorrows = BigNumber(200).times(WAD);
    const totalBorrowShares = BigNumber(100);
    const shareAmount = BigNumber(2);

    // set pool
    await lendingInstance.setPool(pool, totalBorrows, totalBorrowShares);

    const amount = await lendingInstance.calculateRoundUpBorrowAmountExternal(pool, shareAmount);

    const expectedBorrowAmount = BigNumber(4).times(WAD);
    expect(BigNumber(amount)).to.be.bignumber.eq(
      BigNumber(expectedBorrowAmount),
      "Invalid borrow amount"
    );
  });

  it(`Should get the correct round up borrow amount (pool's total borrow shares is less than user share amount)`, async () => {
    const pool = bnbToken.address;
    const totalBorrows = BigNumber(200).times(WAD);
    const totalBorrowShares = BigNumber(100);
    const shareAmount = BigNumber(155);

    // set pool
    await lendingInstance.setPool(pool, totalBorrows, totalBorrowShares);

    const amount = await lendingInstance.calculateRoundUpBorrowAmountExternal(pool, shareAmount);

    const expectedBorrowAmount = BigNumber(310).times(WAD);
    expect(BigNumber(amount)).to.be.bignumber.eq(
      BigNumber(expectedBorrowAmount),
      "Invalid borrow amount"
    );
  });

  it(`Should get the correct round up borrow amount (pool's total borrow shares is 0)`, async () => {
    const pool = bnbToken.address;
    const totalBorrows = BigNumber(0);
    const totalBorrowShares = BigNumber(0);
    const shareAmount = BigNumber(155);

    // set pool
    await lendingInstance.setPool(pool, totalBorrows, totalBorrowShares);

    const amount = await lendingInstance.calculateRoundUpBorrowAmountExternal(pool, shareAmount);

    const expectedBorrowAmount = BigNumber(155);
    expect(BigNumber(amount)).to.be.bignumber.eq(
      BigNumber(expectedBorrowAmount),
      "Invalid borrow amount"
    );
  });

  it(`Should get the correct round up borrow amount (round up case)`, async () => {
    const pool = bnbToken.address;
    const totalBorrows = BigNumber(200).times(WAD);
    const totalBorrowShares = BigNumber(100);
    const shareAmount = BigNumber(55);

    // set pool
    await lendingInstance.setPool(pool, totalBorrows, totalBorrowShares);

    const amount = await lendingInstance.calculateRoundUpBorrowAmountExternal(pool, shareAmount);

    const expectedBorrowAmount = BigNumber(110).times(WAD);
    expect(BigNumber(amount)).to.be.bignumber.eq(
      BigNumber(expectedBorrowAmount),
      "Invalid borrow amount"
    );
  });

  it(`Should calculate linear interest correctly`, async () => {
    const ratePerYear = BigNumber("242857142857142856");
    const SECOUND_PER_30_DAYS = BigNumber(30 * 86400);
    const SECOUND_PER_YEAR = BigNumber(365 * 86400);
    const fromTimestamp = BigNumber("1850114080");
    const toTimestamp = fromTimestamp.plus(SECOUND_PER_30_DAYS);

    const expectedAccumulatedInterestRate = ratePerYear
      .times(toTimestamp.minus(fromTimestamp))
      .dividedBy(WAD)
      .integerValue(BigNumber.ROUND_DOWN)
      .times(WAD)
      .dividedBy(SECOUND_PER_YEAR)
      .integerValue(BigNumber.ROUND_DOWN)
      .plus(WAD);

    const accumulated = await lendingInstance.calculateLinearInterestExternal(
      ratePerYear,
      fromTimestamp,
      toTimestamp
    ); // 1019960838406900050 (101.996% of current total borrow)

    expect(BigNumber(accumulated)).to.be.bignumber.eq(
      expectedAccumulatedInterestRate,
      "Invalid accumulated interest rate"
    );
  });

  it(`Should calculate collateral amount correctly`, async () => {
    // mock price oracle
    const priceOracleInstance = await MockPriceOracle.new();
    await lendingInstance.setPriceOracle(priceOracleInstance.address);

    // mock asset prices
    await priceOracleInstance.setAssetPrice(bnbToken.address, BigNumber(2).times(WAD));
    await priceOracleInstance.setAssetPrice(busdToken.address, BigNumber(3).times(WAD));

    const liquidateAmount = BigNumber("625000000000000000");
    const collateralAmount = await lendingInstance.calculateCollateralAmountExternal(
      bnbToken.address,
      liquidateAmount,
      busdToken.address
    );

    const expectedCollateralAmount = BigNumber("437500000000000000");
    expect(BigNumber(collateralAmount)).to.be.bignumber.eq(
      BigNumber(expectedCollateralAmount),
      "Invalid collateral amount"
    );
  });
})