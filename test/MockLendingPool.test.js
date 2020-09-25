const AlTokenDeployer = artifacts.require("./AlTokenDeployer.sol");
const MockLendingPool = artifacts.require("./MockLendingPool.sol");
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

contract("MockLendingPool", (accounts) => {
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
    lendingInstance = await MockLendingPool.new(alTokenDeployer.address);

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

  it(`Should get the correct total available liquidity of erc20 token`, async () => {
    const pool = bnbToken.address;
    const totalAvailableLiquidity = BigNumber(44.4).times(WAD);

    // mint liquidity to pool
    await bnbToken.mint(lendingInstance.address, totalAvailableLiquidity);

    const actualTotalAvailableLiquidity = await lendingInstance.getTotalAvailableLiquidity(pool);

    expect(BigNumber(actualTotalAvailableLiquidity)).to.be.bignumber.eq(
      BigNumber(totalAvailableLiquidity),
      "Invalid total available liquidity"
    );
  });

  it(`Should get the correct total liquidity`, async () => {
    const pool = bnbToken.address;
    const totalBorrows = BigNumber(30).times(WAD);
    const totalBorrowShares = BigNumber(10);
    const totalAvailableLiquidity = BigNumber(70).times(WAD);

    // set pool
    await lendingInstance.setPool(pool, totalBorrows, totalBorrowShares);

    // mint liquidity to pool
    await bnbToken.mint(lendingInstance.address, totalAvailableLiquidity);

    const totalLiquidity = await lendingInstance.getTotalLiquidity(pool);
    expect(BigNumber(totalLiquidity)).to.be.bignumber.eq(
      totalBorrows.plus(totalAvailableLiquidity).toFixed(0),
      "Invalid total liquidity"
    );
  });

  it(`Should get the correct user's compounded borrow balance`, async () => {
    const pool = bnbToken.address;
    const totalBorrows = BigNumber(30).times(WAD);
    const totalBorrowShares = BigNumber(100);
    const totalLiquidityShares = BigNumber(100);
    const totalAvailableLiquidity = BigNumber(70).times(WAD);
    const userUseAsCollateral = true;
    const userBorrowShares = BigNumber(15);
    const userLiquidityShares = BigNumber(20);

    // mint total borrow amount to the alToken supply
    await lendingInstance.mintAlToken(
      pool,
      lendingInstance.address,
      totalLiquidityShares.minus(userLiquidityShares).times(WAD)
    );
    await lendingInstance.mintAlToken(pool, alice, userLiquidityShares.times(WAD));

    // mint liquidity to pool
    await bnbToken.mint(lendingInstance.address, totalAvailableLiquidity);

    // set pool
    await lendingInstance.setPool(pool, totalBorrows, totalBorrowShares);

    // set user pool data
    await lendingInstance.setUserPool(alice, pool, userUseAsCollateral, userBorrowShares);
    const totalLiquidity = await lendingInstance.getTotalLiquidity(pool);
    const expectedUserCompoundedBorrowBalance = totalBorrows.minus(
      totalBorrowShares
        .minus(userBorrowShares)
        .times(totalBorrows)
        .dividedBy(totalBorrowShares)
        .integerValue(BigNumber.ROUND_DOWN)
    );
    const userCompoundedBorrowBalance = await lendingInstance.getUserCompoundedBorrowBalance(
      alice,
      pool
    );

    expect(BigNumber(totalLiquidity)).to.be.bignumber.eq(
      totalBorrows.plus(totalAvailableLiquidity).toFixed(0),
      "Invalid total liquidity"
    );

    expect(BigNumber(expectedUserCompoundedBorrowBalance)).to.be.bignumber.eq(
      BigNumber(userCompoundedBorrowBalance),
      "Invalid user compounded borrow balance"
    );
  });

  it(`Should get the correct user's compounded liquidity balance`, async () => {
    const pool = bnbToken.address;
    const totalBorrows = BigNumber(115).times(WAD);
    const totalBorrowShares = BigNumber(100);
    const userUseAsCollateral = true;
    const userBorrowShares = BigNumber(37);
    const userLiquidityShares = BigNumber(22);
    const totalLiquidityShares = BigNumber(45);

    // mint total borrow amount to the alToken supply
    await lendingInstance.mintAlToken(
      pool,
      lendingInstance.address,
      totalLiquidityShares.minus(userLiquidityShares).times(WAD)
    );
    await lendingInstance.mintAlToken(pool, alice, userLiquidityShares.times(WAD));

    // set pool
    await lendingInstance.setPool(pool, totalBorrows, totalBorrowShares);

    // set user pool data
    await lendingInstance.setUserPool(alice, pool, userUseAsCollateral, userBorrowShares);
    const totalLiquidity = await lendingInstance.getTotalLiquidity(pool);
    const expectedUserCompoundedLiquidityBalance = userLiquidityShares
      .times(BigNumber(totalLiquidity).div(totalLiquidityShares))
      .toFixed(0);
    const userCompoundedLiquidityBalance = await lendingInstance.getUserCompoundedLiquidityBalance(
      alice,
      pool
    );

    expect(BigNumber(userCompoundedLiquidityBalance)).to.be.bignumber.eq(
      BigNumber(expectedUserCompoundedLiquidityBalance),
      "Invalid user compounded liquidity balance"
    );
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

  it(`Should update pool with interest correctly`, async () => {
    const pool = bnbToken.address;
    const totalBorrows = BigNumber(200).times(WAD);
    const totalBorrowShares = BigNumber(100);
    const availableLiquidity = BigNumber(150).times(WAD);

    // mint liquidity to pool
    await bnbToken.mint(lendingInstance.address, availableLiquidity);

    // set total borrow to pool
    await lendingInstance.setPool(pool, totalBorrows, totalBorrowShares);

    const poolBefore = await lendingInstance.pools(pool);

    expect(BigNumber(poolBefore.totalBorrows)).to.be.bignumber.eq(
      BigNumber(totalBorrows),
      "Invalid total borrows before update pool"
    );

    await time.increase(time.duration.days(30));

    // mock function that call updatePoolWithInterestsAndTimestamp modifier
    await lendingInstance.callAction(pool);

    // expected borrow interest rate = 242857142857142856 (0.242857142857142856%)
    // expected accumulate borrow interest rate = 1019960861056751467 (1.019960861056751467)
    const accumulatedInterestRate = BigNumber("1019960838406900050");
    const expectedNewTotalBorrows = totalBorrows
      .times(accumulatedInterestRate)
      .dividedBy(WAD)
      .integerValue(BigNumber.ROUND_DOWN); //203992167681380010000

    const poolAfter = await lendingInstance.pools(pool);

    expect(BigNumber(poolAfter.totalBorrows)).to.be.bignumber.eq(
      BigNumber(expectedNewTotalBorrows),
      "Invalid total borrows after update pool"
    );
  });

  it(`Should check account health correctly. Account is still healthy.`, async () => {
    // set up pool
    const pools = {
      BNB: {
        tokenInstance: bnbToken,
        totalAvailableLiquidity: BigNumber(200).times(WAD),
        liquidityShares: BigNumber(100).times(WAD),
        totalBorrows: BigNumber(150).times(WAD),
        totalBorrowShares: BigNumber(100).times(WAD),
      },
      BUSD: {
        tokenInstance: busdToken,
        totalAvailableLiquidity: BigNumber(100).times(WAD),
        liquidityShares: BigNumber(10).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(5).times(WAD),
      },
      DAI: {
        tokenInstance: daiToken,
        totalAvailableLiquidity: BigNumber(50).times(WAD),
        liquidityShares: BigNumber(25).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(10).times(WAD),
      },
    };

    // set up pool
    for (const pool of Object.values(pools)) {
      await pool.tokenInstance.mint(lendingInstance.address, pool.totalAvailableLiquidity);

      // mock total supply of alToken
      await lendingInstance.mintAlToken(
        pool.tokenInstance.address,
        lendingInstance.address,
        pool.liquidityShares
      );
      await lendingInstance.setPool(
        lendingInstance.address,
        pool.tokenInstance.address,
        pool.totalBorrows,
        pool.totalBorrowShares
      );
    }

    // the user has BNB and BUSD in pool
    const userData = {
      BNB: {
        poolAddress: bnbToken.address,
        useAsCollateral: true,
        liquidityShares: BigNumber(20).times(WAD), // 1 liquidity share = 2.9166
        borrowShares: BigNumber(10).times(WAD), // 1 borrow share = 1.5
      },
      BUSD: {
        poolAddress: busdToken.address,
        useAsCollateral: true,
        liquidityShares: BigNumber(5).times(WAD), // 1 liquidity share = 8
        borrowShares: BigNumber(2.5).times(WAD), // 1 borrow share = 4
      },
      DAI: {
        poolAddress: daiToken.address,
        useAsCollateral: true,
        liquidityShares: BigNumber(10).times(WAD), // 1 liquidity share = 2
        borrowShares: BigNumber(5).times(WAD), // 1 borrow share = 2
      },
    };

    // set up user data
    const userDataKeys = Object.keys(userData);
    for (let index = 0; index < userDataKeys.length; index++) {
      const data = userData[userDataKeys[index]];
      await lendingInstance.setUserPool(
        bob,
        data.poolAddress,
        data.useAsCollateral,
        data.borrowShares
      );

      // mint liquidity to user
      await lendingInstance.mintAlToken(data.poolAddress, bob, data.liquidityShares);
    }

    // totalBorrowBalanceBase = 35000000000000000000
    // totalCollateralBalanceBase = 88749999999999999999
    // totalBorrowBalanceBase is less than totalBorrowBalanceBase
    // account is healthy
    const isAccountHealthy = await lendingInstance.isAccountHealthy(bob);
    assert.equal(isAccountHealthy, true);
  });

  it(`Should check account health correctly. Borrow value is over collateral value`, async () => {
    // set up pool
    const pools = {
      BNB: {
        tokenInstance: bnbToken,
        totalAvailableLiquidity: BigNumber(200).times(WAD),
        liquidityShares: BigNumber(100).times(WAD),
        totalBorrows: BigNumber(150).times(WAD),
        totalBorrowShares: BigNumber(100).times(WAD),
      },
      BUSD: {
        tokenInstance: busdToken,
        totalAvailableLiquidity: BigNumber(100).times(WAD),
        liquidityShares: BigNumber(10).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(5).times(WAD),
      },
      DAI: {
        tokenInstance: daiToken,
        totalAvailableLiquidity: BigNumber(50).times(WAD),
        liquidityShares: BigNumber(25).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(10).times(WAD),
      },
    };

    // set up pool
    for (const pool of Object.values(pools)) {
      await pool.tokenInstance.mint(lendingInstance.address, pool.totalAvailableLiquidity);

      // mock total supply of alToken
      await lendingInstance.mintAlToken(
        pool.tokenInstance.address,
        lendingInstance.address,
        pool.liquidityShares
      );
      await lendingInstance.setPool(
        lendingInstance.address,
        pool.tokenInstance.address,
        pool.totalBorrows,
        pool.totalBorrowShares
      );
    }

    // the user has BNB and BUSD in pool
    const userData = {
      BNB: {
        poolAddress: bnbToken.address,
        useAsCollateral: true,
        liquidityShares: BigNumber(20).times(WAD), // 1 liquidity share = 2.9166
        borrowShares: BigNumber(60).times(WAD), // 1 borrow share = 1.5
      },
      BUSD: {
        poolAddress: busdToken.address,
        useAsCollateral: true,
        liquidityShares: BigNumber(5).times(WAD), // 1 liquidity share = 8
        borrowShares: BigNumber(0).times(WAD), // 1 borrow share = 4
      },
      DAI: {
        poolAddress: daiToken.address,
        useAsCollateral: true,
        liquidityShares: BigNumber(10).times(WAD), // 1 liquidity share = 2
        borrowShares: BigNumber(0).times(WAD), // 1 borrow share = 2
      },
    };

    // set up user data
    const userDataKeys = Object.keys(userData);
    for (let index = 0; index < userDataKeys.length; index++) {
      const data = userData[userDataKeys[index]];
      await lendingInstance.setUserPool(
        bob,
        data.poolAddress,
        data.useAsCollateral,
        data.borrowShares
      );

      // mint liquidity to user
      await lendingInstance.mintAlToken(data.poolAddress, bob, data.liquidityShares);
    }

    // totalBorrowBalanceBase = 90000000000000000000
    // totalCollateralBalanceBase = 88749999999999999999
    // totalBorrowBalanceBase is more than totalBorrowBalanceBase
    // account is not healthy
    const isAccountHealthy = await lendingInstance.isAccountHealthy(bob);
    assert.equal(isAccountHealthy, false);
  });

  it(`Should check account health correctly. User didn't use DAI as collateral`, async () => {
    // set up pool
    const pools = {
      BNB: {
        tokenInstance: bnbToken,
        totalAvailableLiquidity: BigNumber(200).times(WAD),
        liquidityShares: BigNumber(100).times(WAD),
        totalBorrows: BigNumber(150).times(WAD),
        totalBorrowShares: BigNumber(100).times(WAD),
      },
      BUSD: {
        tokenInstance: busdToken,
        totalAvailableLiquidity: BigNumber(100).times(WAD),
        liquidityShares: BigNumber(10).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(5).times(WAD),
      },
      DAI: {
        tokenInstance: daiToken,
        totalAvailableLiquidity: BigNumber(50).times(WAD),
        liquidityShares: BigNumber(25).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(10).times(WAD),
      },
    };

    // set up pool
    for (const pool of Object.values(pools)) {
      await pool.tokenInstance.mint(lendingInstance.address, pool.totalAvailableLiquidity);

      // mock total supply of alToken
      await lendingInstance.mintAlToken(
        pool.tokenInstance.address,
        lendingInstance.address,
        pool.liquidityShares
      );
      await lendingInstance.setPool(
        lendingInstance.address,
        pool.tokenInstance.address,
        pool.totalBorrows,
        pool.totalBorrowShares
      );
    }

    // the user has BNB and BUSD in pool
    const userData = {
      BNB: {
        poolAddress: bnbToken.address,
        useAsCollateral: true,
        liquidityShares: BigNumber(20).times(WAD), // 1 liquidity share = 2.9166
        borrowShares: BigNumber(30).times(WAD), // 1 borrow share = 1.5
      },
      BUSD: {
        poolAddress: busdToken.address,
        useAsCollateral: true,
        liquidityShares: BigNumber(5).times(WAD), // 1 liquidity share = 8
        borrowShares: BigNumber(5).times(WAD), // 1 borrow share = 4
      },
      DAI: {
        poolAddress: daiToken.address,
        useAsCollateral: false,
        liquidityShares: BigNumber(10).times(WAD), // 1 liquidity share = 2
        borrowShares: BigNumber(10).times(WAD), // 1 borrow share = 2
      },
    };

    // set up user data
    const userDataKeys = Object.keys(userData);
    for (let index = 0; index < userDataKeys.length; index++) {
      const data = userData[userDataKeys[index]];
      await lendingInstance.setUserPool(
        bob,
        data.poolAddress,
        data.useAsCollateral,
        data.borrowShares
      );

      // mint liquidity to user
      await lendingInstance.mintAlToken(data.poolAddress, bob, data.liquidityShares);
    }

    // totalBorrowBalanceBase = 85000000000000000000
    // totalCollateralBalanceBase = 73749999999999999999
    // totalBorrowBalanceBase is more than totalBorrowBalanceBase
    // account is not healthy
    const isAccountHealthy = await lendingInstance.isAccountHealthy(bob);
    assert.equal(isAccountHealthy, false);
  });

  it(`Should check account health correctly. DAI pool can't use as collateral`, async () => {
    // set up pool
    const pools = {
      BNB: {
        tokenInstance: bnbToken,
        totalAvailableLiquidity: BigNumber(200).times(WAD),
        liquidityShares: BigNumber(100).times(WAD),
        totalBorrows: BigNumber(150).times(WAD),
        totalBorrowShares: BigNumber(100).times(WAD),
      },
      BUSD: {
        tokenInstance: busdToken,
        totalAvailableLiquidity: BigNumber(100).times(WAD),
        liquidityShares: BigNumber(10).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(5).times(WAD),
      },
      DAI: {
        tokenInstance: daiToken,
        totalAvailableLiquidity: BigNumber(50).times(WAD),
        liquidityShares: BigNumber(25).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(10).times(WAD),
      },
    };

    // set up pool
    for (const pool of Object.values(pools)) {
      await pool.tokenInstance.mint(lendingInstance.address, pool.totalAvailableLiquidity);

      // mock total supply of alToken
      await lendingInstance.mintAlToken(
        pool.tokenInstance.address,
        lendingInstance.address,
        pool.liquidityShares
      );
      await lendingInstance.setPool(
        lendingInstance.address,
        pool.tokenInstance.address,
        pool.totalBorrows,
        pool.totalBorrowShares
      );
    }

    // cannot use DAI token as collateral.
    const daiPoolConfigInstance = await DefaultPoolConfiguration.new(
      BASE_BORROW_RATE,
      SLOPE1_RATE,
      SLOPE2_RATE,
      BigNumber(0), // collateral percent equals 0 means this token can't use as collateral
      LIQUIDATION_BONUS
    );

    await lendingInstance.setPoolConfig(daiToken.address, daiPoolConfigInstance.address, {
      from: creator,
    });

    // the user has BNB and BUSD in pool
    const userData = {
      BNB: {
        poolAddress: bnbToken.address,
        useAsCollateral: true,
        liquidityShares: BigNumber(20).times(WAD), // 1 liquidity share = 2.9166
        borrowShares: BigNumber(30).times(WAD), // 1 borrow share = 1.5
      },
      BUSD: {
        poolAddress: busdToken.address,
        useAsCollateral: true,
        liquidityShares: BigNumber(5).times(WAD), // 1 liquidity share = 8
        borrowShares: BigNumber(5).times(WAD), // 1 borrow share = 4
      },
      DAI: {
        poolAddress: daiToken.address,
        useAsCollateral: true,
        liquidityShares: BigNumber(10).times(WAD), // 1 liquidity share = 2
        borrowShares: BigNumber(10).times(WAD), // 1 borrow share = 2
      },
    };

    // set up user data
    const userDataKeys = Object.keys(userData);
    for (let index = 0; index < userDataKeys.length; index++) {
      const data = userData[userDataKeys[index]];
      await lendingInstance.setUserPool(
        bob,
        data.poolAddress,
        data.useAsCollateral,
        data.borrowShares
      );

      // mint liquidity to user
      await lendingInstance.mintAlToken(data.poolAddress, bob, data.liquidityShares);
    }

    // totalBorrowBalanceBase = 85000000000000000000
    // totalCollateralBalanceBase = 73749999999999999999
    // totalBorrowBalanceBase is more than totalBorrowBalanceBase
    // account is not healthy
    const isAccountHealthy = await lendingInstance.isAccountHealthy(bob);
    assert.equal(isAccountHealthy, false);
  });

  it(`Should set user use as collateral, account health is still healthy`, async () => {
    // set up pool
    const pools = {
      BNB: {
        tokenInstance: bnbToken,
        totalAvailableLiquidity: BigNumber(200).times(WAD),
        liquidityShares: BigNumber(100).times(WAD),
        totalBorrows: BigNumber(150).times(WAD),
        totalBorrowShares: BigNumber(100).times(WAD),
      },
      BUSD: {
        tokenInstance: busdToken,
        totalAvailableLiquidity: BigNumber(100).times(WAD),
        liquidityShares: BigNumber(10).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(5).times(WAD),
      },
      DAI: {
        tokenInstance: daiToken,
        totalAvailableLiquidity: BigNumber(50).times(WAD),
        liquidityShares: BigNumber(25).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(10).times(WAD),
      },
    };

    // set up pool
    for (const pool of Object.values(pools)) {
      await pool.tokenInstance.mint(lendingInstance.address, pool.totalAvailableLiquidity);

      // mock total supply of alToken
      await lendingInstance.mintAlToken(
        pool.tokenInstance.address,
        lendingInstance.address,
        pool.liquidityShares
      );
      await lendingInstance.setPool(
        lendingInstance.address,
        pool.tokenInstance.address,
        pool.totalBorrows,
        pool.totalBorrowShares
      );
    }

    // the user has BNB and BUSD in pool
    const userData = {
      BNB: {
        poolAddress: bnbToken.address,
        useAsCollateral: true,
        liquidityShares: BigNumber(20).times(WAD), // 1 liquidity share = 2.9166
        borrowShares: BigNumber(10).times(WAD), // 1 borrow share = 1.5
      },
      BUSD: {
        poolAddress: busdToken.address,
        useAsCollateral: true,
        liquidityShares: BigNumber(5).times(WAD), // 1 liquidity share = 8
        borrowShares: BigNumber(2.5).times(WAD), // 1 borrow share = 4
      },
      DAI: {
        poolAddress: daiToken.address,
        useAsCollateral: true,
        liquidityShares: BigNumber(10).times(WAD), // 1 liquidity share = 2
        borrowShares: BigNumber(5).times(WAD), // 1 borrow share = 2
      },
    };

    // set up user data
    const userDataKeys = Object.keys(userData);
    for (let index = 0; index < userDataKeys.length; index++) {
      const data = userData[userDataKeys[index]];
      await lendingInstance.setUserPool(
        bob,
        data.poolAddress,
        data.useAsCollateral,
        data.borrowShares
      );

      // mint liquidity to user
      await lendingInstance.mintAlToken(data.poolAddress, bob, data.liquidityShares);
    }

    const isAccountHealthy = await lendingInstance.isAccountHealthy(bob);
    assert.equal(isAccountHealthy, true);

    await lendingInstance.setUserUseAsCollateral(bnbToken.address, false, {
      from: bob,
    });
  });

  it(`Shouldn't set user use as collateral if account health isn't healthy`, async () => {
    // set up pool
    const pools = {
      BNB: {
        tokenInstance: bnbToken,
        totalAvailableLiquidity: BigNumber(200).times(WAD),
        liquidityShares: BigNumber(100).times(WAD),
        totalBorrows: BigNumber(150).times(WAD),
        totalBorrowShares: BigNumber(100).times(WAD),
      },
      BUSD: {
        tokenInstance: busdToken,
        totalAvailableLiquidity: BigNumber(100).times(WAD),
        liquidityShares: BigNumber(10).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(5).times(WAD),
      },
      DAI: {
        tokenInstance: daiToken,
        totalAvailableLiquidity: BigNumber(50).times(WAD),
        liquidityShares: BigNumber(25).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(10).times(WAD),
      },
    };

    // set up pool
    for (const pool of Object.values(pools)) {
      await pool.tokenInstance.mint(lendingInstance.address, pool.totalAvailableLiquidity);

      // mock total supply of alToken
      await lendingInstance.mintAlToken(
        pool.tokenInstance.address,
        lendingInstance.address,
        pool.liquidityShares
      );
      await lendingInstance.setPool(
        lendingInstance.address,
        pool.tokenInstance.address,
        pool.totalBorrows,
        pool.totalBorrowShares
      );
    }

    // the user has BNB and BUSD in pool
    const userData = {
      BNB: {
        poolAddress: bnbToken.address,
        useAsCollateral: true,
        liquidityShares: BigNumber(20).times(WAD), // 1 liquidity share = 2.9166
        borrowShares: BigNumber(10).times(WAD), // 1 borrow share = 1.5
      },
      BUSD: {
        poolAddress: busdToken.address,
        useAsCollateral: false,
        liquidityShares: BigNumber(5).times(WAD), // 1 liquidity share = 8
        borrowShares: BigNumber(2.5).times(WAD), // 1 borrow share = 4
      },
      DAI: {
        poolAddress: daiToken.address,
        useAsCollateral: false,
        liquidityShares: BigNumber(10).times(WAD), // 1 liquidity share = 2
        borrowShares: BigNumber(5).times(WAD), // 1 borrow share = 2
      },
    };

    // set up user data
    const userDataKeys = Object.keys(userData);
    for (let index = 0; index < userDataKeys.length; index++) {
      const data = userData[userDataKeys[index]];
      await lendingInstance.setUserPool(
        bob,
        data.poolAddress,
        data.useAsCollateral,
        data.borrowShares
      );

      // mint liquidity to user
      await lendingInstance.mintAlToken(data.poolAddress, bob, data.liquidityShares);
    }

    const isAccountHealthy = await lendingInstance.isAccountHealthy(bob);
    assert.equal(isAccountHealthy, true);

    await truffleAssert.reverts(
      lendingInstance.setUserUseAsCollateral(bnbToken.address, false, {
        from: bob,
      }),
      "revert can't set use as collateral, account isn't healthy."
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

  it(`Should withdraw pool reserve by admin`, async () => {
    const expectedWithdrawAmount = BigNumber(10).times(WAD);
    const poolReservesBefore = BigNumber(25).times(WAD);
    await bnbToken.mint(lendingInstance.address, BigNumber(100).times(WAD));
    await lendingInstance.setPoolReserves(bnbToken.address, poolReservesBefore);

    const adminBalanceBefore = await bnbToken.balanceOf(creator);
    await lendingInstance.withdrawReserve(bnbToken.address, expectedWithdrawAmount, {
      from: creator,
    });
    const adminBalanceAfter = await bnbToken.balanceOf(creator);

    expect(BigNumber(expectedWithdrawAmount)).to.be.bignumber.eq(
      BigNumber(adminBalanceAfter).minus(BigNumber(adminBalanceBefore)),
      "Invalid admin balance"
    );

    const pool = await lendingInstance.pools(bnbToken.address);
    expect(BigNumber(pool.poolReserves)).to.be.bignumber.eq(
      BigNumber(poolReservesBefore).minus(BigNumber(expectedWithdrawAmount)),
      "Invalid pool's reserves"
    );
  });

  it(`Shouldn't withdraw pool reserve if user isn't an admin`, async () => {
    const withdrawAmount = BigNumber(10).times(WAD);
    await bnbToken.mint(lendingInstance.address, BigNumber(100).times(WAD));
    await lendingInstance.setPoolReserves(bnbToken.address, withdrawAmount);

    await truffleAssert.reverts(
      lendingInstance.withdrawReserve(bnbToken.address, withdrawAmount, {from: bob}),
      "Ownable: caller is not the owner"
    );
  });

  it(`Should enable user use as collateral if it is the first deposit`, async () => {
    const pool = {
      tokenInstance: bnbToken,
      totalAvailableLiquidity: BigNumber(200).times(WAD),
      liquidityShares: BigNumber(100).times(WAD),
      totalBorrows: BigNumber(150).times(WAD),
      totalBorrowShares: BigNumber(100).times(WAD),
    };

    // mock total supply of alToken
    await lendingInstance.mintAlToken(
      pool.tokenInstance.address,
      lendingInstance.address,
      pool.liquidityShares
    );
    await lendingInstance.setPool(
      lendingInstance.address,
      pool.tokenInstance.address,
      pool.totalBorrows,
      pool.totalBorrowShares
    );

    await lendingInstance.setPoolStatus(pool.tokenInstance.address, poolStatus.ACTIVE);

    const depositAmount = BigNumber(10).times(WAD);
    await bnbToken.mint(alice, depositAmount);
    await bnbToken.approve(lendingInstance.address, depositAmount, {from: alice});
    await lendingInstance.deposit(bnbToken.address, BigNumber(10).times(WAD), {from: alice});
    const userData = await lendingInstance.getUserPoolData(alice, bnbToken.address);
    assert.equal(userData.userUsePoolAsCollateral, true);
  });

  it(`Shouldn't set use as collateral on the second deposit when user disable use as collateral after first deposit`, async () => {
    const pool = {
      tokenInstance: bnbToken,
      totalAvailableLiquidity: BigNumber(200).times(WAD),
      liquidityShares: BigNumber(100).times(WAD),
      totalBorrows: BigNumber(150).times(WAD),
      totalBorrowShares: BigNumber(100).times(WAD),
    };

    // mock total supply of alToken
    await lendingInstance.mintAlToken(
      pool.tokenInstance.address,
      lendingInstance.address,
      pool.liquidityShares
    );
    await lendingInstance.setPool(
      lendingInstance.address,
      pool.tokenInstance.address,
      pool.totalBorrows,
      pool.totalBorrowShares
    );

    await lendingInstance.setPoolStatus(pool.tokenInstance.address, poolStatus.ACTIVE);

    await bnbToken.mint(alice, BigNumber(20).times(WAD));
    await bnbToken.approve(lendingInstance.address, BigNumber(20).times(WAD), {from: alice});

    // first deposit
    await lendingInstance.deposit(bnbToken.address, BigNumber(10).times(WAD), {from: alice});

    // user disable use as collateral
    await lendingInstance.setUserUseAsCollateral(bnbToken.address, false, {from: alice});

    // second deposit
    await lendingInstance.deposit(bnbToken.address, BigNumber(10).times(WAD), {from: alice});

    const userData = await lendingInstance.getUserPoolData(alice, bnbToken.address);
    assert.equal(userData.userUsePoolAsCollateral, false);
  });

  it(`Should get the default use as collateral, if user never deposit to the pool`, async () => {
    const pool = {
      tokenInstance: bnbToken,
      totalAvailableLiquidity: BigNumber(200).times(WAD),
      liquidityShares: BigNumber(100).times(WAD),
      totalBorrows: BigNumber(150).times(WAD),
      totalBorrowShares: BigNumber(100).times(WAD),
    };

    // mock total supply of alToken
    await lendingInstance.mintAlToken(
      pool.tokenInstance.address,
      lendingInstance.address,
      pool.liquidityShares
    );
    await lendingInstance.setPool(
      lendingInstance.address,
      pool.tokenInstance.address,
      pool.totalBorrows,
      pool.totalBorrowShares
    );

    await lendingInstance.setPoolStatus(pool.tokenInstance.address, poolStatus.ACTIVE);

    await bnbToken.mint(alice, BigNumber(20).times(WAD));
    await bnbToken.approve(lendingInstance.address, BigNumber(20).times(WAD), {from: alice});

    const userData = await lendingInstance.getUserPoolData(alice, bnbToken.address);
    assert.equal(userData.userUsePoolAsCollateral, false);
  });
});
