const AlTokenDeployer = artifacts.require("./AlTokenDeployer.sol");
const MockLendingPool = artifacts.require("./MockLendingPool.sol");
const MockPriceOracle = artifacts.require("./MockPriceOracle.sol");
const DefaultPoolConfiguration = artifacts.require("./DefaultPoolConfiguration.sol");
const BNBToken = artifacts.require("./mock/BNBToken.sol");
const BUSDToken = artifacts.require("./mock/BUSDToken.sol");
const DAIToken = artifacts.require("./mock/DAIToken.sol");
const AlToken = artifacts.require("./AlToken.sol");
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

  let priceOracleInstance;
  let lendingInstance;
  // BNB
  let bnbToken;
  let alBNBToken;
  const bnbPricePerUnit = BigNumber(2).times(HALF_WAD);
  // BUSD
  let busdToken;
  let alBUSDToken;
  let busdPricePerUnit = BigNumber(3).times(HALF_WAD);
  // DAI
  let daiToken;
  let alDAIToken;
  let daiPricePerUnit = BigNumber(4).times(HALF_WAD);

  const reservePercent = BigNumber(0.05).times(WAD);

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
    alBNBToken = await AlToken.at(bnbPoolData.alTokenAddress);

    // set up BUSD token pool
    busdToken = await BUSDToken.new();
    await lendingInstance.initPool(busdToken.address, defaultPoolConfigInstance.address, {
      from: creator,
    });
    const busdPoolData = await lendingInstance.getPool(busdToken.address);
    alBUSDToken = await AlToken.at(busdPoolData.alTokenAddress);

    // set up Dai token pool
    daiToken = await DAIToken.new();
    await lendingInstance.initPool(daiToken.address, defaultPoolConfigInstance.address, {
      from: creator,
    });
    const daiPoolData = await lendingInstance.getPool(daiToken.address);
    alDAIToken = await AlToken.at(daiPoolData.alTokenAddress);

    // set up price oracle
    priceOracleInstance = await MockPriceOracle.new();
    await lendingInstance.setPriceOracle(priceOracleInstance.address);
    await priceOracleInstance.setAssetPrice(bnbToken.address, bnbPricePerUnit);
    await priceOracleInstance.setAssetPrice(busdToken.address, busdPricePerUnit);
    await priceOracleInstance.setAssetPrice(daiToken.address, daiPricePerUnit);
  });

  it(`Shouldn't deposit to inactive pool`, async () => {
    const depositAmount = BigNumber(30).times(WAD);

    // set pool status to INACTIVE
    await lendingInstance.setPoolStatus(bnbToken.address, poolStatus.INACTIVE, {
      from: creator,
    });

    await truffleAssert.reverts(
      lendingInstance.deposit(bnbToken.address, depositAmount, {
        from: alice,
      }),
      "revert can't deposit to this pool"
    );
  });

  it(`Shouldn't deposit to closed pool`, async () => {
    const depositAmount = BigNumber(30).times(WAD);

    // set pool status to CLOSED
    await lendingInstance.setPoolStatus(bnbToken.address, poolStatus.CLOSED, {
      from: creator,
    });

    // mint BNB token to user for depositing
    await bnbToken.mint(alice, depositAmount);
    await bnbToken.approve(lendingInstance.address, depositAmount, {
      from: alice,
    });

    await truffleAssert.reverts(
      lendingInstance.deposit(bnbToken.address, depositAmount, {
        from: alice,
      }),
      "revert can't deposit to this pool"
    );
  });

  it(`Should deposit user's liquidity to the lending pool (first deposit transaction)`, async () => {
    const depositAmount = BigNumber(30).times(WAD);

    // set pool to active status
    await lendingInstance.setPoolStatus(bnbToken.address, poolStatus.ACTIVE, {
      from: creator,
    });

    // mint BNB token to user for depositing
    await bnbToken.mint(alice, depositAmount);
    await bnbToken.approve(lendingInstance.address, depositAmount, {
      from: alice,
    });

    // user deposits liquidity to the lending pool
    const tx = await lendingInstance.deposit(bnbToken.address, depositAmount, {
      from: alice,
    });

    const expectedShareAmount = depositAmount; // share amount will equals to deposit amount for the first deposit transaction

    // check deposit event
    truffleAssert.eventEmitted(
      tx,
      "Deposit",
      (ev) => {
        return (
          ev.pool === bnbToken.address &&
          ev.user === alice &&
          ev.depositShares.toString() === expectedShareAmount.toString() &&
          ev.depositAmount.toString() === depositAmount.toString()
        );
      },
      "Deposit event should be emitted with correct parameters"
    );

    // check pool state
    const pool = await lendingInstance.getPool(bnbToken.address);
    expect(BigNumber(pool.totalBorrows)).to.be.bignumber.eq(
      BigNumber(0),
      "Invalid pool total borrows"
    );

    expect(BigNumber(pool.totalBorrowShares)).to.be.bignumber.eq(
      BigNumber(0),
      "Invalid pool total borrow shares"
    );

    // check user pool state
    const userPool = await lendingInstance.userPoolData(alice, bnbToken.address);
    expect(BigNumber(userPool.borrowShares)).to.be.bignumber.eq(
      BigNumber(0),
      "Invalid user borrow share"
    );
    assert.equal(true, userPool.useAsCollateral);

    // check user alToken balance
    const userAlTokenBalanceAfter = await alBNBToken.balanceOf(alice);
    expect(BigNumber(userAlTokenBalanceAfter)).to.be.bignumber.eq(
      expectedShareAmount,
      "Invalid user alToken balance"
    );
    const userBnbTokenBalanceAfter = await bnbToken.balanceOf(alice);
    expect(BigNumber(userBnbTokenBalanceAfter)).to.be.bignumber.eq(
      BigNumber(0),
      "Invalid user bnb token balance"
    );

    //check pool's bnb token balance
    const poolBalanceAfter = await bnbToken.balanceOf(lendingInstance.address);
    expect(BigNumber(poolBalanceAfter)).to.be.bignumber.eq(
      depositAmount,
      "Invalid bnb token pool balance"
    );
  });

  it(`Should deposit user's liquidity to the lending pool (not the first deposit)`, async () => {
    const depositAmount = BigNumber(30).times(WAD);
    const pools = {
      BNB: {
        tokenInstance: bnbToken,
        totalAvailableLiquidity: BigNumber(200).times(WAD),
        totalLiquidityShares: BigNumber(100).times(WAD),
        totalBorrows: BigNumber(150).times(WAD),
        totalBorrowShares: BigNumber(100).times(WAD),
      },
      BUSD: {
        tokenInstance: busdToken,
        totalAvailableLiquidity: BigNumber(100).times(WAD),
        totalLiquidityShares: BigNumber(10).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(5).times(WAD),
      },
      DAI: {
        tokenInstance: daiToken,
        totalAvailableLiquidity: BigNumber(50).times(WAD),
        totalLiquidityShares: BigNumber(25).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(10).times(WAD),
      },
    };

    // set up pool
    for (const pool of Object.values(pools)) {
      await pool.tokenInstance.mint(lendingInstance.address, pool.totalAvailableLiquidity);

      // mock total supply of alToken
      await lendingInstance.mintAlTokenToPool(
        pool.tokenInstance.address,
        pool.totalLiquidityShares
      );
      await lendingInstance.setPool(
        pool.tokenInstance.address,
        pool.totalBorrows,
        pool.totalBorrowShares
      );
    }

    // set pool to active status
    await lendingInstance.setPoolStatus(bnbToken.address, poolStatus.ACTIVE, {
      from: creator,
    });

    // mint BNB token to user for depositing
    await bnbToken.mint(alice, depositAmount);
    await bnbToken.approve(lendingInstance.address, depositAmount, {
      from: alice,
    });

    const expectedShareAmount = depositAmount
      .times(pools.BNB.totalLiquidityShares)
      .dividedBy(pools.BNB.totalBorrows.plus(pools.BNB.totalAvailableLiquidity))
      .integerValue(BigNumber.ROUND_DOWN);

    // user deposits liquidity to the lending pool
    const tx = await lendingInstance.deposit(bnbToken.address, depositAmount, {
      from: alice,
    });

    // check deposit event
    truffleAssert.eventEmitted(
      tx,
      "Deposit",
      (ev) => {
        return (
          ev.pool === bnbToken.address &&
          ev.user === alice &&
          ev.depositShares.toString() === expectedShareAmount.toString() &&
          ev.depositAmount.toString() === depositAmount.toString()
        );
      },
      "Deposit event should be emitted with correct parameters"
    );

    // check pool state
    const pool = await lendingInstance.getPool(bnbToken.address);
    expect(BigNumber(pool.totalBorrows)).to.be.bignumber.eq(
      pools.BNB.totalBorrows,
      "Invalid pool total borrows"
    );

    expect(BigNumber(pool.totalBorrowShares)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalBorrowShares),
      "Invalid pool total borrow shares"
    );

    // check user pool state
    const userPool = await lendingInstance.userPoolData(alice, bnbToken.address);
    expect(BigNumber(userPool.borrowShares)).to.be.bignumber.eq(
      BigNumber(0),
      "Invalid user borrow shares"
    );
    assert.equal(true, userPool.useAsCollateral);

    // check user alToken balance
    const poolTotalLiquidity = pools.BNB.totalAvailableLiquidity.plus(pools.BNB.totalBorrows);
    const expectedAlTokenAmountFromDeposit = depositAmount
      .times(pools.BNB.totalLiquidityShares)
      .dividedBy(poolTotalLiquidity)
      .integerValue(BigNumber.ROUND_DOWN);
    const userAlTokenBalanceAfter = await alBNBToken.balanceOf(alice);
    expect(BigNumber(userAlTokenBalanceAfter)).to.be.bignumber.eq(
      expectedAlTokenAmountFromDeposit,
      "Invalid user alToken balance"
    );
    const userBnbTokenBalanceAfter = await bnbToken.balanceOf(alice);
    expect(BigNumber(userBnbTokenBalanceAfter)).to.be.bignumber.eq(
      BigNumber(0),
      "Invalid user bnb token balance"
    );

    // check pool's bnb token balance
    const poolBalanceAfter = await bnbToken.balanceOf(lendingInstance.address);
    expect(BigNumber(poolBalanceAfter)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalAvailableLiquidity).plus(depositAmount),
      "Invalid bnb token pool balance"
    );

    // check total supply of alToken
    const totalSupply = await alBNBToken.totalSupply();
    expect(BigNumber(totalSupply)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalLiquidityShares).plus(expectedAlTokenAmountFromDeposit),
      "Invalid alToken supply"
    );
  });

  it(`Shouldn't be able to borrow an inactive pool`, async () => {
    const borrowAmount = BigNumber(20).times(WAD);

    // set pool status to INACTIVE
    await lendingInstance.setPoolStatus(bnbToken.address, poolStatus.INACTIVE, {
      from: creator,
    });

    await truffleAssert.reverts(
      lendingInstance.borrow(bnbToken.address, borrowAmount, {
        from: alice,
      }),
      "revert can't borrow this pool"
    );
  });

  it(`Shouldn't be able to borrow a closed pool`, async () => {
    const borrowAmount = BigNumber(20).times(WAD);

    // set pool status to CLOSED
    await lendingInstance.setPoolStatus(bnbToken.address, poolStatus.CLOSED, {
      from: creator,
    });

    await truffleAssert.reverts(
      lendingInstance.borrow(bnbToken.address, borrowAmount, {
        from: alice,
      }),
      "revert can't borrow this pool"
    );
  });

  it(`Shouldn't be able to borrow a borrow-disabled pool`, async () => {
    const borrowAmount = BigNumber(20).times(WAD);

    // set pool status to CLOSED
    await lendingInstance.setPoolStatus(bnbToken.address, poolStatus.CLOSED, {
      from: creator,
    });

    await truffleAssert.reverts(
      lendingInstance.borrow(bnbToken.address, borrowAmount, {
        from: alice,
      }),
      "revert can't borrow this pool"
    );
  });

  it(`Should borrow bnb token from the lending pool`, async () => {
    const borrowAmount = BigNumber(20).times(WAD);
    const pools = {
      BNB: {
        tokenInstance: bnbToken,
        totalAvailableLiquidity: BigNumber(200).times(WAD),
        totalLiquidityShares: BigNumber(100).times(WAD),
        totalBorrows: BigNumber(150).times(WAD),
        totalBorrowShares: BigNumber(100).times(WAD),
      },
      BUSD: {
        tokenInstance: busdToken,
        totalAvailableLiquidity: BigNumber(100).times(WAD),
        totalLiquidityShares: BigNumber(10).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(5).times(WAD),
      },
      DAI: {
        tokenInstance: daiToken,
        totalAvailableLiquidity: BigNumber(50).times(WAD),
        totalLiquidityShares: BigNumber(25).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(10).times(WAD),
      },
    };

    // set up pool
    for (const pool of Object.values(pools)) {
      await pool.tokenInstance.mint(lendingInstance.address, pool.totalAvailableLiquidity);

      // mock total supply of alToken
      await lendingInstance.mintAlTokenToPool(
        pool.tokenInstance.address,
        pool.totalLiquidityShares
      );
      await lendingInstance.setPool(
        pool.tokenInstance.address,
        pool.totalBorrows,
        pool.totalBorrowShares
      );
    }

    // set pool to active status
    await lendingInstance.setPoolStatus(bnbToken.address, poolStatus.ACTIVE, {
      from: creator,
    });

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
        alice,
        data.poolAddress,
        data.useAsCollateral,
        data.borrowShares
      );

      // mint liquidity to user
      await lendingInstance.mintAlTokenToUser(data.poolAddress, alice, data.liquidityShares);
    }

    const tx = await lendingInstance.borrow(bnbToken.address, borrowAmount, {
      from: alice,
    });

    // calculate expected user borrow shares
    const expectedUserBorrowShare = pools.BNB.totalBorrowShares.minus(
      pools.BNB.totalBorrows
        .minus(borrowAmount)
        .times(pools.BNB.totalBorrowShares)
        .dividedBy(pools.BNB.totalBorrows)
        .integerValue(BigNumber.ROUND_DOWN)
    ); // user's borrow shares is 13333333333333333334

    // check borrow event
    truffleAssert.eventEmitted(
      tx,
      "Borrow",
      (ev) => {
        return (
          ev.pool === bnbToken.address &&
          ev.user === alice &&
          ev.borrowAmount.toString() === borrowAmount.toString() &&
          ev.borrowShares.toString() === expectedUserBorrowShare.toString()
        );
      },
      "Borrow event should be emitted with correct parameters"
    );

    // check pool state
    const poolAfter = await lendingInstance.getPool(bnbToken.address);
    expect(BigNumber(poolAfter.totalBorrows)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalBorrows.plus(borrowAmount)),
      "Invalid pool total borrows"
    );
    expect(BigNumber(poolAfter.totalBorrowShares)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalBorrowShares.plus(expectedUserBorrowShare)),
      "Invalid pool total borrow shares"
    );

    // check user pool state
    const userPoolAfter = await lendingInstance.userPoolData(alice, bnbToken.address);
    expect(BigNumber(userPoolAfter.borrowShares)).to.be.bignumber.eq(
      BigNumber(userData.BNB.borrowShares.plus(expectedUserBorrowShare)),
      "Invalid user borrow shares"
    );
    assert.equal(true, userPoolAfter.useAsCollateral);

    // check pool's bnb token balance
    const poolBalanceAfter = await bnbToken.balanceOf(lendingInstance.address);
    expect(BigNumber(poolBalanceAfter)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalAvailableLiquidity.minus(borrowAmount)),
      "Invalid pool's bnb token balance after borrow"
    );

    // check user's bnb token balance
    const userBalanceAfter = await bnbToken.balanceOf(alice);
    expect(BigNumber(userBalanceAfter)).to.be.bignumber.eq(
      BigNumber(borrowAmount),
      "Invalid user's bnb token balance after borrow"
    );
  });

  it(`Should borrow bnb token from the lending pool (3 months interest)`, async () => {
    const borrowAmount = BigNumber(20).times(WAD);
    const pools = {
      BNB: {
        tokenInstance: bnbToken,
        totalAvailableLiquidity: BigNumber(200).times(WAD),
        totalLiquidityShares: BigNumber(100).times(WAD),
        totalBorrows: BigNumber(150).times(WAD),
        totalBorrowShares: BigNumber(100).times(WAD),
      },
      BUSD: {
        tokenInstance: busdToken,
        totalAvailableLiquidity: BigNumber(100).times(WAD),
        totalLiquidityShares: BigNumber(10).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(5).times(WAD),
      },
      DAI: {
        tokenInstance: daiToken,
        totalAvailableLiquidity: BigNumber(50).times(WAD),
        totalLiquidityShares: BigNumber(25).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(10).times(WAD),
      },
    };

    // set up pool
    for (const pool of Object.values(pools)) {
      await pool.tokenInstance.mint(lendingInstance.address, pool.totalAvailableLiquidity);

      // mock total supply of alToken
      await lendingInstance.mintAlTokenToPool(
        pool.tokenInstance.address,
        pool.totalLiquidityShares
      );
      await lendingInstance.setPool(
        pool.tokenInstance.address,
        pool.totalBorrows,
        pool.totalBorrowShares
      );
    }

    // set pool to active status
    await lendingInstance.setPoolStatus(bnbToken.address, poolStatus.ACTIVE, {
      from: creator,
    });

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
        alice,
        data.poolAddress,
        data.useAsCollateral,
        data.borrowShares
      );

      // mint liquidity to user
      await lendingInstance.mintAlTokenToUser(data.poolAddress, alice, data.liquidityShares);
    }

    // time pass 3 months
    await time.increase(time.duration.days(90));
    const tx = await lendingInstance.borrow(bnbToken.address, borrowAmount, {
      from: alice,
    });

    // the borrow interest is 51076325469304921 then the pool's total borrows will be 1.051076325469304921x of the current pool's total borrows
    const cumulativeBorrowInterest = BigNumber("1051076325469304921");
    const expectedBnbTotalBorrowsAfterUpdateInterest = pools.BNB.totalBorrows
      .times(cumulativeBorrowInterest)
      .dividedBy(WAD)
      .integerValue(BigNumber.ROUND_DOWN); // pool's total borrows is 157661448820395738150

    // calculate expected user borrow shares
    expectedUserBorrowShare = pools.BNB.totalBorrowShares.minus(
      expectedBnbTotalBorrowsAfterUpdateInterest
        .minus(borrowAmount)
        .times(pools.BNB.totalBorrowShares)
        .dividedBy(expectedBnbTotalBorrowsAfterUpdateInterest)
        .integerValue(BigNumber.ROUND_DOWN)
    ); // user's borrow shares is 12685409242168981736

    const expectedPoolReserve = expectedBnbTotalBorrowsAfterUpdateInterest
      .minus(pools.BNB.totalBorrows)
      .times(reservePercent)
      .dividedBy(WAD)
      .integerValue(BigNumber.ROUND_DOWN);

    // check borrow event
    truffleAssert.eventEmitted(
      tx,
      "Borrow",
      (ev) => {
        return (
          ev.pool === bnbToken.address &&
          ev.user === alice &&
          ev.borrowAmount.toString() === borrowAmount.toString() &&
          ev.borrowShares.toString() === expectedUserBorrowShare.toString()
        );
      },
      "Borrow event should be emitted with correct parameters"
    );

    // check pool state
    const poolAfter = await lendingInstance.getPool(bnbToken.address);
    expect(BigNumber(poolAfter.totalBorrows)).to.be.bignumber.eq(
      BigNumber(expectedBnbTotalBorrowsAfterUpdateInterest.plus(borrowAmount)),
      "Invalid pool total borrows"
    );
    expect(BigNumber(poolAfter.totalBorrowShares)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalBorrowShares.plus(expectedUserBorrowShare)),
      "Invalid pool total borrow shares"
    );

    const poolData = await lendingInstance.pools(bnbToken.address);
    expect(BigNumber(poolData.poolReserves)).to.be.bignumber.eq(
      BigNumber(expectedPoolReserve),
      "Invalid pool reserves"
    );

    // check user pool state
    const userPoolAfter = await lendingInstance.userPoolData(alice, bnbToken.address);
    expect(BigNumber(userPoolAfter.borrowShares)).to.be.bignumber.eq(
      BigNumber(userData.BNB.borrowShares.plus(expectedUserBorrowShare)),
      "Invalid user borrow shares"
    );
    assert.equal(true, userPoolAfter.useAsCollateral);

    // check pool's bnb token balance
    const poolBalanceAfter = await bnbToken.balanceOf(lendingInstance.address);
    expect(BigNumber(poolBalanceAfter)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalAvailableLiquidity.minus(borrowAmount)),
      "Invalid pool's bnb token balance after borrow"
    );

    // check user's bnb token balance
    const userBalanceAfter = await bnbToken.balanceOf(alice);
    expect(BigNumber(userBalanceAfter)).to.be.bignumber.eq(
      BigNumber(borrowAmount),
      "Invalid user's bnb token balance after borrow"
    );
  });

  it(`Shouldn't be able to borrow bnb token from the lending pool. user account isn't healthy`, async () => {
    const borrowAmount = BigNumber(100).times(WAD);
    const pools = {
      BNB: {
        tokenInstance: bnbToken,
        totalAvailableLiquidity: BigNumber(200).times(WAD),
        totalLiquidityShares: BigNumber(100).times(WAD),
        totalBorrows: BigNumber(150).times(WAD),
        totalBorrowShares: BigNumber(100).times(WAD),
      },
      BUSD: {
        tokenInstance: busdToken,
        totalAvailableLiquidity: BigNumber(100).times(WAD),
        totalLiquidityShares: BigNumber(10).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(5).times(WAD),
      },
      DAI: {
        tokenInstance: daiToken,
        totalAvailableLiquidity: BigNumber(50).times(WAD),
        totalLiquidityShares: BigNumber(25).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(10).times(WAD),
      },
    };

    // set up pool
    for (const pool of Object.values(pools)) {
      await pool.tokenInstance.mint(lendingInstance.address, pool.totalAvailableLiquidity);

      // mock total supply of alToken
      await lendingInstance.mintAlTokenToPool(
        pool.tokenInstance.address,
        pool.totalLiquidityShares
      );
      await lendingInstance.setPool(
        pool.tokenInstance.address,
        pool.totalBorrows,
        pool.totalBorrowShares
      );
    }

    // set pool to active status
    await lendingInstance.setPoolStatus(bnbToken.address, poolStatus.ACTIVE, {
      from: creator,
    });

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
        alice,
        data.poolAddress,
        data.useAsCollateral,
        data.borrowShares
      );

      // mint liquidity to user
      await lendingInstance.mintAlTokenToUser(data.poolAddress, alice, data.liquidityShares);
    }

    await truffleAssert.reverts(
      lendingInstance.borrow(bnbToken.address, borrowAmount, {
        from: alice,
      }),
      "account is not healthy. can't borrow."
    );

    // pool and user states should be the same as before borrowing
    // check pool state
    const poolAfter = await lendingInstance.getPool(bnbToken.address);
    expect(BigNumber(poolAfter.totalBorrows)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalBorrows),
      "Invalid pool total borrows"
    );
    expect(BigNumber(poolAfter.totalBorrowShares)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalBorrowShares),
      "Invalid pool total borrow shares"
    );

    // check user pool state
    const userPoolAfter = await lendingInstance.userPoolData(alice, bnbToken.address);
    expect(BigNumber(userPoolAfter.borrowShares)).to.be.bignumber.eq(
      BigNumber(userData.BNB.borrowShares),
      "Invalid user borrow shares"
    );
    assert.equal(true, userPoolAfter.useAsCollateral);

    // check pool's bnb token balance
    const poolBalanceAfter = await bnbToken.balanceOf(lendingInstance.address);
    expect(BigNumber(poolBalanceAfter)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalAvailableLiquidity),
      "Invalid pool's bnb token balance"
    );

    // check user's bnb token balance
    const userBalanceAfter = await bnbToken.balanceOf(alice);
    expect(BigNumber(userBalanceAfter)).to.be.bignumber.eq(
      BigNumber(0),
      "Invalid user's bnb token balance"
    );
  });

  it(`Shouldn't repay to inactive pool`, async () => {
    const repayShare = BigNumber(20).times(WAD);

    // set pool status to INACTIVE
    await lendingInstance.setPoolStatus(bnbToken.address, poolStatus.INACTIVE, {
      from: creator,
    });

    await truffleAssert.reverts(
      lendingInstance.repayByShare(bnbToken.address, repayShare, {
        from: alice,
      }),
      "revert can't repay to this pool"
    );
  });

  it(`Should repay to closed pool`, async () => {
    const repayShares = BigNumber(10).times(WAD);

    // set up pool
    const pools = {
      BNB: {
        tokenInstance: bnbToken,
        totalAvailableLiquidity: BigNumber(200).times(WAD),
        totalLiquidityShares: BigNumber(100).times(WAD),
        totalBorrows: BigNumber(150).times(WAD),
        totalBorrowShares: BigNumber(100).times(WAD),
      },
      BUSD: {
        tokenInstance: busdToken,
        totalAvailableLiquidity: BigNumber(100).times(WAD),
        totalLiquidityShares: BigNumber(10).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(5).times(WAD),
      },
      DAI: {
        tokenInstance: daiToken,
        totalAvailableLiquidity: BigNumber(50).times(WAD),
        totalLiquidityShares: BigNumber(25).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(10).times(WAD),
      },
    };

    for (const pool of Object.values(pools)) {
      await pool.tokenInstance.mint(lendingInstance.address, pool.totalAvailableLiquidity);

      // mock total supply of alToken
      await lendingInstance.mintAlTokenToPool(
        pool.tokenInstance.address,
        pool.totalLiquidityShares
      );
      await lendingInstance.setPool(
        pool.tokenInstance.address,
        pool.totalBorrows,
        pool.totalBorrowShares
      );
    }

    // set pool status to ACTIVE
    await lendingInstance.setPoolStatus(bnbToken.address, poolStatus.ACTIVE, {
      from: creator,
    });

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
        alice,
        data.poolAddress,
        data.useAsCollateral,
        data.borrowShares
      );

      // mint liquidity to user
      await lendingInstance.mintAlTokenToUser(data.poolAddress, alice, data.liquidityShares);
    }

    // user borrows bnb tokens from the lending pool
    await lendingInstance.borrow(bnbToken.address, repayShares, {
      from: alice,
    });

    // set pool status to CLOSED
    await lendingInstance.setPoolStatus(bnbToken.address, poolStatus.CLOSED, {
      from: creator,
    });

    // mint BNB token to user for repaying
    const userBnbBalance = BigNumber(1000).times(WAD);
    await bnbToken.mint(alice, userBnbBalance);
    await bnbToken.approve(lendingInstance.address, userBnbBalance, {
      from: alice,
    });

    // user repays bnb tokens to the lending pool
    const tx = await lendingInstance.repayByShare(bnbToken.address, repayShares, {
      from: alice,
    });

    const expectedPaybackAmount = pools.BNB.totalBorrows.minus(
      pools.BNB.totalBorrowShares
        .minus(repayShares)
        .times(pools.BNB.totalBorrows)
        .dividedBy(pools.BNB.totalBorrowShares)
        .integerValue(BigNumber.ROUND_DOWN)
    );

    // check repay event
    truffleAssert.eventEmitted(
      tx,
      "Repay",
      (ev) => {
        return (
          ev.pool === bnbToken.address &&
          ev.user === alice &&
          ev.repayShares.toString() === repayShares.toString() &&
          ev.repayAmount.toString() === expectedPaybackAmount.toString()
        );
      },
      "Repay event should be emitted with correct parameters"
    );
  });

  it(`Shouldn't repay bnb token if user don't have the borrowing`, async () => {
    const repayShare = BigNumber(30).times(WAD);

    // set up pool
    const pools = {
      BNB: {
        tokenInstance: bnbToken,
        totalAvailableLiquidity: BigNumber(200).times(WAD),
        totalLiquidityShares: BigNumber(100).times(WAD),
        totalBorrows: BigNumber(150).times(WAD),
        totalBorrowShares: BigNumber(100).times(WAD),
      },
      BUSD: {
        tokenInstance: busdToken,
        totalAvailableLiquidity: BigNumber(100).times(WAD),
        totalLiquidityShares: BigNumber(10).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(5).times(WAD),
      },
      DAI: {
        tokenInstance: daiToken,
        totalAvailableLiquidity: BigNumber(50).times(WAD),
        totalLiquidityShares: BigNumber(25).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(10).times(WAD),
      },
    };

    for (const pool of Object.values(pools)) {
      await pool.tokenInstance.mint(lendingInstance.address, pool.totalAvailableLiquidity);

      // mock total supply of alToken
      await lendingInstance.mintAlTokenToPool(
        pool.tokenInstance.address,
        pool.totalLiquidityShares
      );
      await lendingInstance.setPool(
        pool.tokenInstance.address,
        pool.totalBorrows,
        pool.totalBorrowShares
      );
    }

    // set pool status to ACTIVE
    await lendingInstance.setPoolStatus(bnbToken.address, poolStatus.ACTIVE, {
      from: creator,
    });

    const userData = {
      BNB: {
        poolAddress: bnbToken.address,
        useAsCollateral: true,
        liquidityShares: BigNumber(20).times(WAD), // 1 liquidity share = 2.9166
        borrowShares: BigNumber(0).times(WAD), // user never borrow bnb token
      },
    };

    // set up user data
    const userDataKeys = Object.keys(userData);
    for (let index = 0; index < userDataKeys.length; index++) {
      const data = userData[userDataKeys[index]];
      await lendingInstance.setUserPool(
        alice,
        data.poolAddress,
        data.useAsCollateral,
        data.borrowShares
      );

      // mint liquidity to user
      await lendingInstance.mintAlTokenToUser(data.poolAddress, alice, data.liquidityShares);
    }

    const userBnbBalanceBefore = BigNumber(100).times(WAD);
    // mint bnb token to user for repaying
    await bnbToken.mint(alice, userBnbBalanceBefore);
    await bnbToken.approve(lendingInstance.address, userBnbBalanceBefore, {from: alice});

    // user repays bnb tokens to the lending pool
    await lendingInstance.repayByShare(bnbToken.address, repayShare, {
      from: alice,
    });

    // check pool state
    const poolAfter = await lendingInstance.getPool(bnbToken.address);
    expect(BigNumber(poolAfter.totalBorrows)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalBorrows),
      "Invalid pool total borrows"
    );
    expect(BigNumber(poolAfter.totalBorrowShares)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalBorrowShares),
      "Invalid pool total borrow shares"
    );

    // check user state
    const userAfter = await lendingInstance.userPoolData(alice, bnbToken.address);
    expect(BigNumber(userAfter.borrowShares)).to.be.bignumber.eq(
      BigNumber(userData.BNB.borrowShares),
      "Invalid user borrow shares"
    );

    // check pool balance
    const poolBalanceAfter = await bnbToken.balanceOf(lendingInstance.address);
    expect(BigNumber(poolBalanceAfter)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalAvailableLiquidity),
      "Invalid pool balance after repay"
    );

    // check user balance
    const userBnbBalanceAfter = await bnbToken.balanceOf(alice);
    expect(BigNumber(userBnbBalanceAfter)).to.be.bignumber.eq(
      BigNumber(userBnbBalanceBefore),
      "Invalid user balance after repay"
    );
  });

  it(`Should repay bnb token to the lending pool`, async () => {
    const repayShare = BigNumber(9).times(WAD);

    // set up pool
    const pools = {
      BNB: {
        tokenInstance: bnbToken,
        totalAvailableLiquidity: BigNumber(200).times(WAD),
        totalLiquidityShares: BigNumber(100).times(WAD),
        totalBorrows: BigNumber(150).times(WAD),
        totalBorrowShares: BigNumber(100).times(WAD),
      },
      BUSD: {
        tokenInstance: busdToken,
        totalAvailableLiquidity: BigNumber(100).times(WAD),
        totalLiquidityShares: BigNumber(10).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(5).times(WAD),
      },
      DAI: {
        tokenInstance: daiToken,
        totalAvailableLiquidity: BigNumber(50).times(WAD),
        totalLiquidityShares: BigNumber(25).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(10).times(WAD),
      },
    };

    for (const pool of Object.values(pools)) {
      await pool.tokenInstance.mint(lendingInstance.address, pool.totalAvailableLiquidity);

      // mock total supply of alToken
      await lendingInstance.mintAlTokenToPool(
        pool.tokenInstance.address,
        pool.totalLiquidityShares
      );
      await lendingInstance.setPool(
        pool.tokenInstance.address,
        pool.totalBorrows,
        pool.totalBorrowShares
      );
    }

    // set pool status to ACTIVE
    await lendingInstance.setPoolStatus(bnbToken.address, poolStatus.ACTIVE, {
      from: creator,
    });

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
        alice,
        data.poolAddress,
        data.useAsCollateral,
        data.borrowShares
      );

      // mint liquidity to user
      await lendingInstance.mintAlTokenToUser(data.poolAddress, alice, data.liquidityShares);
    }

    // mint BNB token to user for repaying
    const userBnbTokenBalance = BigNumber(1000).times(WAD);
    await bnbToken.mint(alice, userBnbTokenBalance);
    await bnbToken.approve(lendingInstance.address, userBnbTokenBalance, {
      from: alice,
    });

    await lendingInstance.repayByShare(bnbToken.address, repayShare, {
      from: alice,
    });

    const paybackAmount = pools.BNB.totalBorrows.minus(
      pools.BNB.totalBorrowShares
        .minus(repayShare)
        .times(pools.BNB.totalBorrows)
        .dividedBy(pools.BNB.totalBorrowShares)
        .integerValue(BigNumber.ROUND_DOWN)
    );

    // check pool state
    const poolAfter = await lendingInstance.getPool(bnbToken.address);
    expect(BigNumber(poolAfter.totalBorrows)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalBorrows.minus(paybackAmount)),
      "Invalid pool total borrows"
    );
    expect(BigNumber(poolAfter.totalBorrowShares)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalBorrowShares.minus(repayShare)),
      "Invalid pool total borrow shares"
    );

    // check user state
    const userAfter = await lendingInstance.userPoolData(alice, bnbToken.address);
    expect(BigNumber(userAfter.borrowShares)).to.be.bignumber.eq(
      BigNumber(userData.BNB.borrowShares.minus(repayShare)),
      "Invalid user borrow shares"
    );

    // check pool's bnb token balance
    const poolBalanceAfter = await bnbToken.balanceOf(lendingInstance.address);
    expect(BigNumber(poolBalanceAfter)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalAvailableLiquidity.plus(paybackAmount)),
      "Invalid pool's bnb balance"
    );

    // check user's bnb token balance
    const userBalanceAfter = await bnbToken.balanceOf(alice);
    expect(BigNumber(userBalanceAfter)).to.be.bignumber.eq(
      BigNumber(userBnbTokenBalance.minus(paybackAmount)),
      "Invalid user's bnb balance"
    );
  });

  it(`Should be able to repay equal to borrow shares if user repay more than borrow shares`, async () => {
    const repayShares = BigNumber(1000).times(WAD);

    // set up pool
    const pools = {
      BNB: {
        tokenInstance: bnbToken,
        totalAvailableLiquidity: BigNumber(200).times(WAD),
        totalLiquidityShares: BigNumber(100).times(WAD),
        totalBorrows: BigNumber(150).times(WAD),
        totalBorrowShares: BigNumber(100).times(WAD),
      },
      BUSD: {
        tokenInstance: busdToken,
        totalAvailableLiquidity: BigNumber(100).times(WAD),
        totalLiquidityShares: BigNumber(10).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(5).times(WAD),
      },
      DAI: {
        tokenInstance: daiToken,
        totalAvailableLiquidity: BigNumber(50).times(WAD),
        totalLiquidityShares: BigNumber(25).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(10).times(WAD),
      },
    };

    for (const pool of Object.values(pools)) {
      await pool.tokenInstance.mint(lendingInstance.address, pool.totalAvailableLiquidity);

      // mock total supply of alToken
      await lendingInstance.mintAlTokenToPool(
        pool.tokenInstance.address,
        pool.totalLiquidityShares
      );
      await lendingInstance.setPool(
        pool.tokenInstance.address,
        pool.totalBorrows,
        pool.totalBorrowShares
      );
    }

    // set pool status to ACTIVE
    await lendingInstance.setPoolStatus(bnbToken.address, poolStatus.ACTIVE, {
      from: creator,
    });

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
        alice,
        data.poolAddress,
        data.useAsCollateral,
        data.borrowShares
      );

      // mint liquidity to user
      await lendingInstance.mintAlTokenToUser(data.poolAddress, alice, data.liquidityShares);
    }

    // mint BNB token to user for repaying
    const userBnbTokenBalance = BigNumber(1000).times(WAD);
    await bnbToken.mint(alice, userBnbTokenBalance);
    await bnbToken.approve(lendingInstance.address, userBnbTokenBalance, {
      from: alice,
    });

    await lendingInstance.repayByShare(bnbToken.address, repayShares, {
      from: alice,
    });

    const expectedPaybackAmount = BigNumber("15000000000000000000");
    // check pool state
    const poolAfter = await lendingInstance.getPool(bnbToken.address);
    expect(BigNumber(poolAfter.totalBorrows)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalBorrows.minus(expectedPaybackAmount)),
      "Invalid pool total borrows"
    );
    expect(BigNumber(poolAfter.totalBorrowShares)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalBorrowShares.minus(userData.BNB.borrowShares)),
      "Invalid pool total borrow shares"
    );

    // check user state
    const userAfter = await lendingInstance.userPoolData(alice, bnbToken.address);
    expect(BigNumber(userAfter.borrowShares)).to.be.bignumber.eq(
      BigNumber(userData.BNB.borrowShares.minus(userData.BNB.borrowShares)),
      "Invalid user borrow shares"
    );

    // check pool's bnb token balance
    const poolBalanceAfter = await bnbToken.balanceOf(lendingInstance.address);
    expect(BigNumber(poolBalanceAfter)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalAvailableLiquidity.plus(expectedPaybackAmount)),
      "Invalid pool's bnb balance"
    );

    // check user's bnb token balance
    const userBalanceAfter = await bnbToken.balanceOf(alice);
    expect(BigNumber(userBalanceAfter)).to.be.bignumber.eq(
      BigNumber(userBnbTokenBalance.minus(expectedPaybackAmount)),
      "Invalid user's bnb balance"
    );
  });

  it(`Should be able to repay by amount correctly if user input the repay amount over the borrow amount.`, async () => {
    const repayAmount = BigNumber(1000).times(WAD);

    // set up pool
    const pools = {
      BNB: {
        tokenInstance: bnbToken,
        totalAvailableLiquidity: BigNumber(200).times(WAD),
        totalLiquidityShares: BigNumber(100).times(WAD),
        totalBorrows: BigNumber(150).times(WAD),
        totalBorrowShares: BigNumber(100).times(WAD),
      },
      BUSD: {
        tokenInstance: busdToken,
        totalAvailableLiquidity: BigNumber(100).times(WAD),
        totalLiquidityShares: BigNumber(10).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(5).times(WAD),
      },
      DAI: {
        tokenInstance: daiToken,
        totalAvailableLiquidity: BigNumber(50).times(WAD),
        totalLiquidityShares: BigNumber(25).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(10).times(WAD),
      },
    };

    for (const pool of Object.values(pools)) {
      await pool.tokenInstance.mint(lendingInstance.address, pool.totalAvailableLiquidity);

      // mock total supply of alToken
      await lendingInstance.mintAlTokenToPool(
        pool.tokenInstance.address,
        pool.totalLiquidityShares
      );
      await lendingInstance.setPool(
        pool.tokenInstance.address,
        pool.totalBorrows,
        pool.totalBorrowShares
      );
    }

    // set pool status to ACTIVE
    await lendingInstance.setPoolStatus(bnbToken.address, poolStatus.ACTIVE, {
      from: creator,
    });

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
        alice,
        data.poolAddress,
        data.useAsCollateral,
        data.borrowShares
      );

      // mint liquidity to user
      await lendingInstance.mintAlTokenToUser(data.poolAddress, alice, data.liquidityShares);
    }

    // mint BNB token to user for repaying
    const userBnbTokenBalance = BigNumber(1000).times(WAD);
    await bnbToken.mint(alice, userBnbTokenBalance);
    await bnbToken.approve(lendingInstance.address, userBnbTokenBalance, {
      from: alice,
    });

    await lendingInstance.repayByAmount(bnbToken.address, repayAmount, {
      from: alice,
    });

    const expectedPaybackAmount = BigNumber("15000000000000000000");
    // check pool state
    const poolAfter = await lendingInstance.getPool(bnbToken.address);
    expect(BigNumber(poolAfter.totalBorrows)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalBorrows.minus(expectedPaybackAmount)),
      "Invalid pool total borrows"
    );
    expect(BigNumber(poolAfter.totalBorrowShares)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalBorrowShares.minus(userData.BNB.borrowShares)),
      "Invalid pool total borrow shares"
    );

    // check user state
    const userAfter = await lendingInstance.userPoolData(alice, bnbToken.address);
    expect(BigNumber(userAfter.borrowShares)).to.be.bignumber.eq(
      BigNumber(userData.BNB.borrowShares.minus(userData.BNB.borrowShares)),
      "Invalid user borrow shares"
    );

    // check pool's bnb token balance
    const poolBalanceAfter = await bnbToken.balanceOf(lendingInstance.address);
    expect(BigNumber(poolBalanceAfter)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalAvailableLiquidity.plus(expectedPaybackAmount)),
      "Invalid pool's bnb balance"
    );

    // check user's bnb token balance
    const userBalanceAfter = await bnbToken.balanceOf(alice);
    expect(BigNumber(userBalanceAfter)).to.be.bignumber.eq(
      BigNumber(userBnbTokenBalance.minus(expectedPaybackAmount)),
      "Invalid user's bnb balance"
    );
  });

  it(`Should be able to repay by amount correctly if user input the repay amount less than the borrow amount.`, async () => {
    const repayAmount = BigNumber(13).times(WAD);

    // set up pool
    const pools = {
      BNB: {
        tokenInstance: bnbToken,
        totalAvailableLiquidity: BigNumber(200).times(WAD),
        totalLiquidityShares: BigNumber(100).times(WAD),
        totalBorrows: BigNumber(150).times(WAD),
        totalBorrowShares: BigNumber(100).times(WAD),
      },
      BUSD: {
        tokenInstance: busdToken,
        totalAvailableLiquidity: BigNumber(100).times(WAD),
        totalLiquidityShares: BigNumber(10).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(5).times(WAD),
      },
      DAI: {
        tokenInstance: daiToken,
        totalAvailableLiquidity: BigNumber(50).times(WAD),
        totalLiquidityShares: BigNumber(25).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(10).times(WAD),
      },
    };

    for (const pool of Object.values(pools)) {
      await pool.tokenInstance.mint(lendingInstance.address, pool.totalAvailableLiquidity);

      // mock total supply of alToken
      await lendingInstance.mintAlTokenToPool(
        pool.tokenInstance.address,
        pool.totalLiquidityShares
      );
      await lendingInstance.setPool(
        pool.tokenInstance.address,
        pool.totalBorrows,
        pool.totalBorrowShares
      );
    }

    // set pool status to ACTIVE
    await lendingInstance.setPoolStatus(bnbToken.address, poolStatus.ACTIVE, {
      from: creator,
    });

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
        alice,
        data.poolAddress,
        data.useAsCollateral,
        data.borrowShares
      );

      // mint liquidity to user
      await lendingInstance.mintAlTokenToUser(data.poolAddress, alice, data.liquidityShares);
    }

    // mint BNB token to user for repaying
    const userBnbTokenBalance = BigNumber(repayAmount).times(WAD);
    await bnbToken.mint(alice, userBnbTokenBalance);
    await bnbToken.approve(lendingInstance.address, userBnbTokenBalance, {
      from: alice,
    });

    const tx = await lendingInstance.repayByAmount(bnbToken.address, repayAmount, {
      from: alice,
    });

    const expectedPaybackAmount = BigNumber("12999999999999999999");
    const expectShares = BigNumber("8666666666666666666");

    // check repay event
    truffleAssert.eventEmitted(
      tx,
      "Repay",
      (ev) => {
        return (
          ev.pool === bnbToken.address &&
          ev.user === alice &&
          ev.repayShares.toString() === expectShares.toString() &&
          ev.repayAmount.toString() === expectedPaybackAmount.toString()
        );
      },
      "Repay event should be emitted with correct parameters"
    );

    // check pool state
    const poolAfter = await lendingInstance.getPool(bnbToken.address);
    expect(BigNumber(poolAfter.totalBorrows)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalBorrows.minus(expectedPaybackAmount)),
      "Invalid pool total borrows"
    );
    expect(BigNumber(poolAfter.totalBorrowShares)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalBorrowShares.minus(expectShares)),
      "Invalid pool total borrow shares"
    );

    // check user state
    const userAfter = await lendingInstance.userPoolData(alice, bnbToken.address);
    expect(BigNumber(userAfter.borrowShares)).to.be.bignumber.eq(
      BigNumber(userData.BNB.borrowShares.minus(expectShares)),
      "Invalid user borrow shares"
    );

    // check pool's bnb token balance
    const poolBalanceAfter = await bnbToken.balanceOf(lendingInstance.address);
    expect(BigNumber(poolBalanceAfter)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalAvailableLiquidity.plus(expectedPaybackAmount)),
      "Invalid pool's bnb balance"
    );

    // check user's bnb token balance
    const userBalanceAfter = await bnbToken.balanceOf(alice);
    expect(BigNumber(userBalanceAfter)).to.be.bignumber.eq(
      BigNumber(userBnbTokenBalance.minus(expectedPaybackAmount)),
      "Invalid user's bnb balance"
    );
  });

  it(`Should repay by amount correctly with 3 months interest`, async () => {
    const repayAmount = BigNumber(15).times(WAD);

    // set up pool
    const pools = {
      BNB: {
        tokenInstance: bnbToken,
        totalAvailableLiquidity: BigNumber(200).times(WAD),
        totalLiquidityShares: BigNumber(100).times(WAD),
        totalBorrows: BigNumber(150).times(WAD),
        totalBorrowShares: BigNumber(100).times(WAD),
      },
      BUSD: {
        tokenInstance: busdToken,
        totalAvailableLiquidity: BigNumber(100).times(WAD),
        totalLiquidityShares: BigNumber(10).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(5).times(WAD),
      },
      DAI: {
        tokenInstance: daiToken,
        totalAvailableLiquidity: BigNumber(50).times(WAD),
        totalLiquidityShares: BigNumber(25).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(10).times(WAD),
      },
    };

    for (const pool of Object.values(pools)) {
      await pool.tokenInstance.mint(lendingInstance.address, pool.totalAvailableLiquidity);

      // mock total supply of alToken
      await lendingInstance.mintAlTokenToPool(
        pool.tokenInstance.address,
        pool.totalLiquidityShares
      );
      await lendingInstance.setPool(
        pool.tokenInstance.address,
        pool.totalBorrows,
        pool.totalBorrowShares
      );
    }

    // set pool status to ACTIVE
    await lendingInstance.setPoolStatus(bnbToken.address, poolStatus.ACTIVE, {
      from: creator,
    });

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
        alice,
        data.poolAddress,
        data.useAsCollateral,
        data.borrowShares
      );

      // mint liquidity to user
      await lendingInstance.mintAlTokenToUser(data.poolAddress, alice, data.liquidityShares);
    }

    // time pass 3 months
    await time.increase(time.duration.days(90));

    // the borrow interest is 51076325469304921 then the pool's total borrows will be 1.051076325469304921x of the current pool's total borrows
    const cumulativeBorrowInterest = BigNumber("1051076325469304921");
    const expectedBnbTotalBorrowsAfterUpdateInterest = pools.BNB.totalBorrows
      .times(cumulativeBorrowInterest)
      .dividedBy(WAD)
      .integerValue(BigNumber.ROUND_DOWN); // pool's total borrows is 157661448820395738150
    const expectShares = repayAmount
      .times(pools.BNB.totalBorrowShares)
      .dividedBy(expectedBnbTotalBorrowsAfterUpdateInterest)
      .integerValue(BigNumber.ROUND_DOWN); // expected payback shares = 9514056931626736301
    const expectedPaybackAmount = expectedBnbTotalBorrowsAfterUpdateInterest.minus(
      pools.BNB.totalBorrowShares
        .minus(expectShares)
        .times(expectedBnbTotalBorrowsAfterUpdateInterest)
        .dividedBy(pools.BNB.totalBorrowShares)
        .integerValue(BigNumber.ROUND_DOWN)
    ); // expected payback amount = 15000000000000000000

    const expectedPoolReserve = expectedBnbTotalBorrowsAfterUpdateInterest
      .minus(pools.BNB.totalBorrows)
      .times(reservePercent)
      .dividedBy(WAD)
      .integerValue(BigNumber.ROUND_DOWN);

    // mint BNB token to user for repaying
    const userBnbTokenBalance = BigNumber(repayAmount).times(WAD);
    await bnbToken.mint(alice, userBnbTokenBalance);
    await bnbToken.approve(lendingInstance.address, userBnbTokenBalance, {
      from: alice,
    });

    const tx = await lendingInstance.repayByAmount(bnbToken.address, repayAmount, {
      from: alice,
    });

    // check repay event
    truffleAssert.eventEmitted(
      tx,
      "Repay",
      (ev) => {
        return (
          ev.pool === bnbToken.address &&
          ev.user === alice &&
          ev.repayShares.toString() === expectShares.toString() &&
          ev.repayAmount.toString() === expectedPaybackAmount.toString()
        );
      },
      "Repay event should be emitted with correct parameters"
    );

    // check pool state
    const poolAfter = await lendingInstance.getPool(bnbToken.address);
    expect(BigNumber(poolAfter.totalBorrows)).to.be.bignumber.eq(
      BigNumber(expectedBnbTotalBorrowsAfterUpdateInterest.minus(expectedPaybackAmount)),
      "Invalid pool total borrows"
    );
    expect(BigNumber(poolAfter.totalBorrowShares)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalBorrowShares.minus(expectShares)),
      "Invalid pool total borrow shares"
    );

    const poolData = await lendingInstance.pools(bnbToken.address);
    expect(BigNumber(poolData.poolReserves)).to.be.bignumber.eq(
      BigNumber(expectedPoolReserve),
      "Invalid pool reserves"
    );

    // check user state
    const userAfter = await lendingInstance.userPoolData(alice, bnbToken.address);
    expect(BigNumber(userAfter.borrowShares)).to.be.bignumber.eq(
      BigNumber(userData.BNB.borrowShares.minus(expectShares)),
      "Invalid user borrow shares"
    );

    // check pool's bnb token balance
    const poolBalanceAfter = await bnbToken.balanceOf(lendingInstance.address);
    expect(BigNumber(poolBalanceAfter)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalAvailableLiquidity.plus(expectedPaybackAmount)),
      "Invalid pool's bnb balance"
    );

    // check user's bnb token balance
    const userBalanceAfter = await bnbToken.balanceOf(alice);
    expect(BigNumber(userBalanceAfter)).to.be.bignumber.eq(
      BigNumber(userBnbTokenBalance.minus(expectedPaybackAmount)),
      "Invalid user's bnb balance"
    );
  });

  it(`Shouldn't be able to withdraw an inactive pool`, async () => {
    const withdrawShares = BigNumber(20).times(WAD);

    // set pool status to INACTIVE
    await lendingInstance.setPoolStatus(bnbToken.address, poolStatus.INACTIVE, {
      from: creator,
    });

    await truffleAssert.reverts(
      lendingInstance.withdraw(bnbToken.address, withdrawShares, {
        from: alice,
      }),
      "revert can't withdraw this pool"
    );
  });

  it(`Should withdraw a closed pool`, async () => {
    const withdrawShares = BigNumber(10).times(WAD);

    // set up pool
    const pools = {
      BNB: {
        tokenInstance: bnbToken,
        totalAvailableLiquidity: BigNumber(200).times(WAD),
        totalLiquidityShares: BigNumber(100).times(WAD),
        totalBorrows: BigNumber(150).times(WAD),
        totalBorrowShares: BigNumber(100).times(WAD),
      },
      BUSD: {
        tokenInstance: busdToken,
        totalAvailableLiquidity: BigNumber(100).times(WAD),
        totalLiquidityShares: BigNumber(10).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(5).times(WAD),
      },
      DAI: {
        tokenInstance: daiToken,
        totalAvailableLiquidity: BigNumber(50).times(WAD),
        totalLiquidityShares: BigNumber(25).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(10).times(WAD),
      },
    };

    for (const pool of Object.values(pools)) {
      await pool.tokenInstance.mint(lendingInstance.address, pool.totalAvailableLiquidity);

      // mock total supply of alToken
      await lendingInstance.mintAlTokenToPool(
        pool.tokenInstance.address,
        pool.totalLiquidityShares
      );
      await lendingInstance.setPool(
        pool.tokenInstance.address,
        pool.totalBorrows,
        pool.totalBorrowShares
      );
    }

    // set pool status to CLOSED
    await lendingInstance.setPoolStatus(bnbToken.address, poolStatus.CLOSED, {
      from: creator,
    });

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
        alice,
        data.poolAddress,
        data.useAsCollateral,
        data.borrowShares
      );

      // mint liquidity to user
      await lendingInstance.mintAlTokenToUser(data.poolAddress, alice, data.liquidityShares);
    }

    // user withdraws bnb token from the lending pool
    await lendingInstance.withdraw(bnbToken.address, withdrawShares, {
      from: alice,
    });
  });

  it(`Should withdraw ERC20 tokens correctly`, async () => {
    const withdrawShares = BigNumber(10).times(WAD);

    // set up pool
    const pools = {
      BNB: {
        tokenInstance: bnbToken,
        totalAvailableLiquidity: BigNumber(200).times(WAD),
        totalLiquidityShares: BigNumber(100).times(WAD),
        totalBorrows: BigNumber(150).times(WAD),
        totalBorrowShares: BigNumber(100).times(WAD),
      },
      BUSD: {
        tokenInstance: busdToken,
        totalAvailableLiquidity: BigNumber(100).times(WAD),
        totalLiquidityShares: BigNumber(10).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(5).times(WAD),
      },
      DAI: {
        tokenInstance: daiToken,
        totalAvailableLiquidity: BigNumber(50).times(WAD),
        totalLiquidityShares: BigNumber(25).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(10).times(WAD),
      },
    };

    for (const pool of Object.values(pools)) {
      await pool.tokenInstance.mint(lendingInstance.address, pool.totalAvailableLiquidity);

      // mock total supply of alToken
      await lendingInstance.mintAlTokenToPool(
        pool.tokenInstance.address,
        pool.totalLiquidityShares
      );
      await lendingInstance.setPool(
        pool.tokenInstance.address,
        pool.totalBorrows,
        pool.totalBorrowShares
      );
    }

    // set pool status to CLOSED
    await lendingInstance.setPoolStatus(bnbToken.address, poolStatus.CLOSED, {
      from: creator,
    });

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
        alice,
        data.poolAddress,
        data.useAsCollateral,
        data.borrowShares
      );

      // mint liquidity to user
      await lendingInstance.mintAlTokenToUser(data.poolAddress, alice, data.liquidityShares);
    }

    // user withdraws bnb token from the lending pool
    const tx = await lendingInstance.withdraw(bnbToken.address, withdrawShares, {
      from: alice,
    });

    const expectedWithdrawAmount = BigNumber("29166666666666666666");

    // check repay event
    truffleAssert.eventEmitted(
      tx,
      "Withdraw",
      (ev) => {
        return (
          ev.pool === bnbToken.address &&
          ev.user === alice &&
          ev.withdrawShares.toString() === withdrawShares.toString() &&
          ev.withdrawAmount.toString() === expectedWithdrawAmount.toString()
        );
      },
      "Withdraw event should be emitted with correct parameters"
    );

    // check pool state
    const poolAfter = await lendingInstance.getPool(bnbToken.address);
    expect(BigNumber(poolAfter.totalBorrows)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalBorrows),
      "Invalid pool total borrows"
    );

    expect(BigNumber(poolAfter.totalBorrowShares)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalBorrowShares),
      "Invalid pool total borrow shares"
    );

    // check user state
    const userAfter = await lendingInstance.userPoolData(alice, bnbToken.address);
    expect(BigNumber(userAfter.borrowShares)).to.be.bignumber.eq(
      BigNumber(userData.BNB.borrowShares),
      "Invalid user borrow shares"
    );

    // check pool's bnb token balance
    const poolBalanceAfter = await bnbToken.balanceOf(lendingInstance.address);
    expect(BigNumber(poolBalanceAfter)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalAvailableLiquidity).minus(expectedWithdrawAmount),
      "Invalid user's bnb balance"
    );

    // check user's bnb token balance
    const userBalanceAfter = await bnbToken.balanceOf(alice);
    expect(BigNumber(userBalanceAfter)).to.be.bignumber.eq(
      BigNumber(expectedWithdrawAmount),
      "Invalid user's bnb balance"
    );
  });

  it(`Shouldn't withdraw ERC20 tokens. account isn't healthy`, async () => {
    const withdrawShares = BigNumber(30).times(WAD);

    // set up pool
    const pools = {
      BNB: {
        tokenInstance: bnbToken,
        totalAvailableLiquidity: BigNumber(200).times(WAD),
        totalLiquidityShares: BigNumber(100).times(WAD),
        totalBorrows: BigNumber(150).times(WAD),
        totalBorrowShares: BigNumber(100).times(WAD),
      },
      BUSD: {
        tokenInstance: busdToken,
        totalAvailableLiquidity: BigNumber(100).times(WAD),
        totalLiquidityShares: BigNumber(10).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(5).times(WAD),
      },
      DAI: {
        tokenInstance: daiToken,
        totalAvailableLiquidity: BigNumber(50).times(WAD),
        totalLiquidityShares: BigNumber(25).times(WAD),
        totalBorrows: BigNumber(20).times(WAD),
        totalBorrowShares: BigNumber(10).times(WAD),
      },
    };

    for (const pool of Object.values(pools)) {
      await pool.tokenInstance.mint(lendingInstance.address, pool.totalAvailableLiquidity);

      // mock total supply of alToken
      await lendingInstance.mintAlTokenToPool(
        pool.tokenInstance.address,
        pool.totalLiquidityShares
      );
      await lendingInstance.setPool(
        pool.tokenInstance.address,
        pool.totalBorrows,
        pool.totalBorrowShares
      );
    }

    // set pool status to CLOSED
    await lendingInstance.setPoolStatus(bnbToken.address, poolStatus.CLOSED, {
      from: creator,
    });

    const userData = {
      BNB: {
        poolAddress: bnbToken.address,
        useAsCollateral: true,
        liquidityShares: BigNumber(20).times(WAD), // 1 liquidity share = 2.9166
        borrowShares: BigNumber(10).times(WAD), // 1 borrow share = 1.5
      },
    };

    // set up user data
    const userDataKeys = Object.keys(userData);
    for (let index = 0; index < userDataKeys.length; index++) {
      const data = userData[userDataKeys[index]];
      await lendingInstance.setUserPool(
        alice,
        data.poolAddress,
        data.useAsCollateral,
        data.borrowShares
      );

      // mint liquidity to user
      await lendingInstance.mintAlTokenToUser(data.poolAddress, alice, data.liquidityShares);
    }

    await truffleAssert.reverts(
      lendingInstance.withdraw(bnbToken.address, withdrawShares, {
        from: alice,
      }),
      "revert account is not healthy. can't withdraw"
    );
  });

  it(`Shouldn't liquidate an inactive pool`, async () => {
    const liquidateShares = BigNumber(20).times(WAD);

    // set pool status to INACTIVE
    await lendingInstance.setPoolStatus(bnbToken.address, poolStatus.INACTIVE, {
      from: creator,
    });

    // bob liquidates alice account on busd pool to get bnb as collateral
    await truffleAssert.reverts(
      lendingInstance.liquidate(alice, busdToken.address, liquidateShares, bnbToken.address, {
        from: bob,
      }),
      "revert can't liquidate this pool"
    );
  });

  it(`Shouldn't liquidate the healthy account`, async () => {
    const liquidateShares = BigNumber(20).times(WAD);
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
      await lendingInstance.mintAlTokenToPool(pool.tokenInstance.address, pool.liquidityShares);
      await lendingInstance.setPool(
        pool.tokenInstance.address,
        pool.totalBorrows,
        pool.totalBorrowShares
      );
    }

    // set pool status to ACTIVE
    await lendingInstance.setPoolStatus(bnbToken.address, poolStatus.ACTIVE, {
      from: creator,
    });

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
        alice,
        data.poolAddress,
        data.useAsCollateral,
        data.borrowShares
      );

      // mint liquidity to user
      await lendingInstance.mintAlTokenToUser(data.poolAddress, alice, data.liquidityShares);
    }

    const aliceAccountHealthy = await lendingInstance.isAccountHealthy(alice);
    assert.equal(true, aliceAccountHealthy);

    // totalBorrowBalanceBase = 35000000000000000000
    // totalCollateralBalanceBase = 88749999999999999999
    // alice account is still healthy

    // bob liquidates alice account
    await truffleAssert.reverts(
      lendingInstance.liquidate(alice, bnbToken.address, liquidateShares, busdToken.address, {
        from: bob,
      }),
      "revert user's account is healthy. can't liquidate this account"
    );
  });

  it(`Shouldn't liquidate the bnb of alice account which didn't enable as collateral`, async () => {
    const liquidateShares = BigNumber(20).times(WAD);
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
      await lendingInstance.mintAlTokenToPool(pool.tokenInstance.address, pool.liquidityShares);
      await lendingInstance.setPool(
        pool.tokenInstance.address,
        pool.totalBorrows,
        pool.totalBorrowShares
      );
    }

    // the user has BNB and BUSD in pool
    const userData = {
      BNB: {
        poolAddress: bnbToken.address,
        useAsCollateral: false,
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
        alice,
        data.poolAddress,
        data.useAsCollateral,
        data.borrowShares
      );

      // mint liquidity to user
      await lendingInstance.mintAlTokenToUser(data.poolAddress, alice, data.liquidityShares);
    }

    // set pool status to ACTIVE
    await lendingInstance.setPoolStatus(busdToken.address, poolStatus.ACTIVE, {
      from: creator,
    });

    const isAccountHealthy = await lendingInstance.isAccountHealthy(alice);
    assert.equal(false, isAccountHealthy);

    // bob liquidates alice account
    await truffleAssert.reverts(
      lendingInstance.liquidate(alice, busdToken.address, liquidateShares, bnbToken.address, {
        from: bob,
      }),
      "revert user didn't enable the requested collateral"
    );
  });

  it(`Shouldn't liquidate bnb on alice account which didn't borrow bnb token`, async () => {
    const liquidateShares = BigNumber(20).times(WAD);
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
      await lendingInstance.mintAlTokenToPool(pool.tokenInstance.address, pool.liquidityShares);
      await lendingInstance.setPool(
        pool.tokenInstance.address,
        pool.totalBorrows,
        pool.totalBorrowShares
      );
    }

    // set pool status to ACTIVE
    await lendingInstance.setPoolStatus(bnbToken.address, poolStatus.ACTIVE, {
      from: creator,
    });

    const userData = {
      BNB: {
        poolAddress: bnbToken.address,
        useAsCollateral: true,
        liquidityShares: BigNumber(20).times(WAD), // 1 liquidity share = 2.9166
        borrowShares: BigNumber(30).times(WAD), // 1 borrow share = 1.5
      },
      BUSD: {
        poolAddress: busdToken.address,
        useAsCollateral: false,
        liquidityShares: BigNumber(5).times(WAD), // 1 liquidity share = 8
        borrowShares: BigNumber(0).times(WAD), // 1 borrow share = 4
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
        alice,
        data.poolAddress,
        data.useAsCollateral,
        data.borrowShares
      );

      // mint liquidity to user
      await lendingInstance.mintAlTokenToUser(data.poolAddress, alice, data.liquidityShares);
    }

    // set pool status to ACTIVE
    await lendingInstance.setPoolStatus(busdToken.address, poolStatus.ACTIVE, {
      from: creator,
    });

    const isAccountHealthy = await lendingInstance.isAccountHealthy(alice);
    assert.equal(isAccountHealthy, false);

    // bob liquidates alice account
    await truffleAssert.reverts(
      lendingInstance.liquidate(alice, busdToken.address, liquidateShares, bnbToken.address, {
        from: bob,
      }),
      "revert user didn't borrow this token"
    );
  });

  it(`Shouldn't liquidate bnb. Pool isn't enabled to use as collateral`, async () => {
    const liquidateShares = BigNumber(20).times(WAD);
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
      await lendingInstance.mintAlTokenToPool(pool.tokenInstance.address, pool.liquidityShares);
      await lendingInstance.setPool(
        pool.tokenInstance.address,
        pool.totalBorrows,
        pool.totalBorrowShares
      );
    }

    const userData = {
      BNB: {
        poolAddress: bnbToken.address,
        useAsCollateral: true,
        liquidityShares: BigNumber(20).times(WAD), // 1 liquidity share = 2.9166
        borrowShares: BigNumber(30).times(WAD), // 1 borrow share = 1.5
      },
      BUSD: {
        poolAddress: busdToken.address,
        useAsCollateral: false,
        liquidityShares: BigNumber(5).times(WAD), // 1 liquidity share = 8
        borrowShares: BigNumber(0).times(WAD), // 1 borrow share = 4
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
        alice,
        data.poolAddress,
        data.useAsCollateral,
        data.borrowShares
      );

      // mint liquidity to user
      await lendingInstance.mintAlTokenToUser(data.poolAddress, alice, data.liquidityShares);
    }

    // set pool status to ACTIVE
    await lendingInstance.setPoolStatus(busdToken.address, poolStatus.ACTIVE, {
      from: creator,
    });

    bnbPoolConfigInstance = await DefaultPoolConfiguration.new(
      BASE_BORROW_RATE,
      SLOPE1_RATE,
      SLOPE2_RATE,
      BigNumber(0),
      LIQUIDATION_BONUS
    );

    // can't use busd as collateral
    await lendingInstance.setPoolConfig(bnbToken.address, bnbPoolConfigInstance.address);

    const isAccountHealthy = await lendingInstance.isAccountHealthy(alice);
    assert.equal(isAccountHealthy, false);

    // bob liquidates alice account
    await truffleAssert.reverts(
      lendingInstance.liquidate(alice, busdToken.address, liquidateShares, bnbToken.address, {
        from: bob,
      }),
      "revert this pool isn't used as collateral"
    );
  });

  it(`Shouldn't liquidate bnb, if bnb balance of alice isn't enough`, async () => {
    const liquidateShares = BigNumber(5).times(WAD);
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
      await lendingInstance.mintAlTokenToPool(pool.tokenInstance.address, pool.liquidityShares);
      await lendingInstance.setPool(
        pool.tokenInstance.address,
        pool.totalBorrows,
        pool.totalBorrowShares
      );
    }

    const userData = {
      BNB: {
        poolAddress: bnbToken.address,
        useAsCollateral: true,
        liquidityShares: BigNumber(1).times(WAD), // 1 liquidity share = 2.9166
        borrowShares: BigNumber(30).times(WAD), // 1 borrow share = 1.5
      },
      BUSD: {
        poolAddress: busdToken.address,
        useAsCollateral: false,
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
        alice,
        data.poolAddress,
        data.useAsCollateral,
        data.borrowShares
      );

      // mint liquidity to user
      await lendingInstance.mintAlTokenToUser(data.poolAddress, alice, data.liquidityShares);
    }

    // mint busd to liquidator
    await busdToken.mint(bob, BigNumber(1000).times(WAD));
    await busdToken.approve(lendingInstance.address, BigNumber(1000).times(WAD), {from: bob});

    // set pool status to ACTIVE
    await lendingInstance.setPoolStatus(busdToken.address, poolStatus.ACTIVE, {
      from: creator,
    });

    const isAccountHealthy = await lendingInstance.isAccountHealthy(alice);
    assert.equal(isAccountHealthy, false);

    // bob liquidates alice account
    await truffleAssert.reverts(
      lendingInstance.liquidate(alice, busdToken.address, liquidateShares, bnbToken.address, {
        from: bob,
      }),
      "revert user collateral isn't enough"
    );
  });

  it(`Should liquidate bnb. alice account isn't healthy`, async () => {
    let liquidateShares = BigNumber(20).times(WAD);
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
      await lendingInstance.mintAlTokenToPool(pool.tokenInstance.address, pool.liquidityShares);
      await lendingInstance.setPool(
        pool.tokenInstance.address,
        pool.totalBorrows,
        pool.totalBorrowShares
      );
    }

    // set pool status to ACTIVE
    await lendingInstance.setPoolStatus(bnbToken.address, poolStatus.ACTIVE, {
      from: creator,
    });

    const userData = {
      BNB: {
        poolAddress: bnbToken.address,
        useAsCollateral: true,
        liquidityShares: BigNumber(20).times(WAD), // 1 liquidity share = 2.9166
        borrowShares: BigNumber(33).times(WAD), // 1 borrow share = 1.5
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
        alice,
        data.poolAddress,
        data.useAsCollateral,
        data.borrowShares
      );

      // mint liquidity to user
      await lendingInstance.mintAlTokenToUser(data.poolAddress, alice, data.liquidityShares);
    }

    // set pool status to ACTIVE
    await lendingInstance.setPoolStatus(busdToken.address, poolStatus.ACTIVE, {
      from: creator,
    });

    // time pass 3 months
    await time.increase(time.duration.days(90));

    // mint busd token to liquidator for liquidation
    const liquidatorBalance = BigNumber(1000).times(WAD);
    await busdToken.mint(bob, liquidatorBalance);
    await busdToken.approve(lendingInstance.address, liquidatorBalance, {from: bob});

    // adjust liquidate share that can liquidate
    // liquidator can liquidate 50% of user's liquidate shares per time
    liquidateShares = BigNumber(0.5)
      .times(WAD)
      .times(userData.BUSD.borrowShares)
      .dividedBy(WAD)
      .integerValue(BigNumber.ROUND_DOWN);

    // the busd borrow interest is 34931506849315068 then the busd pool's total borrows will be 1.034931506849315068x of the current pool's total borrows
    const cumulativeBusdBorrowInterest = BigNumber("1034931506849315068");
    const expectedBusdTotalBorrowsAfterUpdateInterest = pools.BUSD.totalBorrows
      .times(cumulativeBusdBorrowInterest)
      .dividedBy(WAD)
      .integerValue(BigNumber.ROUND_DOWN); // busd pool's total borrows is 20698630136986301360

    // the bnb borrow interest is 51076325469304921 then the bnb pool's total borrows will be 1.051076325469304921
    const cumulativeBnbBorrowInterest = BigNumber("1051076325469304921");
    const expectedBnbTotalBorrowsAfterUpdateInterest = pools.BNB.totalBorrows
      .times(cumulativeBnbBorrowInterest)
      .dividedBy(WAD)
      .integerValue(BigNumber.ROUND_DOWN);

    const expectedPurchaseAmount = liquidateShares
      .times(expectedBusdTotalBorrowsAfterUpdateInterest)
      .plus(pools.BUSD.totalBorrowShares.minus(1))
      .dividedBy(pools.BUSD.totalBorrowShares)
      .integerValue(BigNumber.ROUND_DOWN);

    const expectedCollateralAmount = busdPricePerUnit
      .times(expectedPurchaseAmount)
      .times(LIQUIDATION_BONUS)
      .dividedBy(WAD)
      .integerValue(BigNumber.ROUND_DOWN)
      .dividedBy(bnbPricePerUnit)
      .integerValue(BigNumber.ROUND_DOWN);

    const bnbPoolReserve = expectedBnbTotalBorrowsAfterUpdateInterest
      .minus(pools.BNB.totalBorrows)
      .times(reservePercent)
      .dividedBy(WAD)
      .integerValue(BigNumber.ROUND_DOWN);
    const bnbTotalLiquidity = pools.BNB.totalAvailableLiquidity
      .plus(expectedBnbTotalBorrowsAfterUpdateInterest)
      .minus(bnbPoolReserve);
    const bnbTotalLiquidityShares = BigNumber(await alBNBToken.totalSupply());
    const expectedCollateralShares = expectedCollateralAmount
      .times(bnbTotalLiquidityShares)
      .plus(bnbTotalLiquidity.minus(1))
      .dividedBy(bnbTotalLiquidity)
      .integerValue(BigNumber.ROUND_DOWN);

    const tx = await lendingInstance.liquidate(
      alice,
      busdToken.address,
      liquidateShares,
      bnbToken.address,
      {from: bob}
    );

    // check liquidate event
    truffleAssert.eventEmitted(
      tx,
      "Liquidate",
      (ev) => {
        return (
          ev.user === alice &&
          ev.pool === busdToken.address &&
          ev.collateral === bnbToken.address &&
          ev.liquidateAmount.toString() === expectedPurchaseAmount.toString() &&
          ev.liquidateShares.toString() === liquidateShares.toString() &&
          ev.collateralAmount.toString() === expectedCollateralAmount.toString() &&
          ev.collateralShares.toString() === expectedCollateralShares.toString() &&
          ev.liquidator.toString() === bob
        );
      },
      "Liquidate event should be emitted with correct parameters"
    );

    // check pool state
    // busd pool
    const busdPool = await lendingInstance.getPool(busdToken.address);
    expect(BigNumber(busdPool.totalBorrows)).to.be.bignumber.eq(
      BigNumber(expectedBusdTotalBorrowsAfterUpdateInterest.minus(expectedPurchaseAmount)),
      "Invalid busd pool total borrows"
    );
    expect(BigNumber(busdPool.totalBorrowShares)).to.be.bignumber.eq(
      BigNumber(pools.BUSD.totalBorrowShares.minus(liquidateShares)),
      "Invalid busd pool total borrow shares"
    );

    // bnb pool
    const bnbPool = await lendingInstance.getPool(bnbToken.address);
    expect(BigNumber(bnbPool.totalBorrows)).to.be.bignumber.eq(
      BigNumber(expectedBnbTotalBorrowsAfterUpdateInterest),
      "Invalid bnb pool total borrows"
    );
    expect(BigNumber(bnbPool.totalBorrowShares)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalBorrowShares),
      "Invalid bnb pool total borrows"
    );

    // check user pool state
    userPool = await lendingInstance.userPoolData(alice, busdToken.address);
    expect(BigNumber(userPool.borrowShares)).to.be.bignumber.eq(
      BigNumber(userData.BUSD.borrowShares.minus(liquidateShares)),
      "Invalid user borrow share"
    );

    // check user's al token balance
    const userAlTokenBalanceAfter = await alBNBToken.balanceOf(alice);
    expect(BigNumber(userAlTokenBalanceAfter)).to.be.bignumber.eq(
      BigNumber(userData.BNB.liquidityShares.minus(expectedCollateralShares)),
      "Invalid user al token balance"
    );

    // check liquidator busd token balance
    const liquidatorBusdBalanceAfter = await busdToken.balanceOf(bob);
    expect(BigNumber(liquidatorBusdBalanceAfter)).to.be.bignumber.eq(
      BigNumber(liquidatorBalance.minus(expectedPurchaseAmount)),
      "Invalid liquidator busd token balance"
    );

    // check liquidator al token balance
    const liquidatorBnbBalanceAfter = await alBNBToken.balanceOf(bob);
    expect(BigNumber(liquidatorBnbBalanceAfter)).to.be.bignumber.eq(
      BigNumber(expectedCollateralShares),
      "Invalid liquidator al token balance"
    );

    // ckeck pool token balance
    const busdBalanceAfter = await busdToken.balanceOf(lendingInstance.address);
    expect(BigNumber(busdBalanceAfter)).to.be.bignumber.eq(
      BigNumber(pools.BUSD.totalAvailableLiquidity.plus(expectedPurchaseAmount)),
      "Invalid pool's busd balance"
    );
    const bnbBalanceAfter = await bnbToken.balanceOf(lendingInstance.address);
    expect(BigNumber(bnbBalanceAfter)).to.be.bignumber.eq(
      BigNumber(pools.BNB.totalAvailableLiquidity),
      "Invalid pool's bnb balance"
    );
  });

  it(`Should deposit and borrow bnb token from the lending pool`, async () => {
    const depositAmount = BigNumber(100).times(WAD);
    const borrowAmount1 = BigNumber(20).times(WAD);
    const borrowAmount2 = BigNumber(40).times(WAD); // second borrow amount is more than pool's total borrows

    // set pool to active status
    await lendingInstance.setPoolStatus(bnbToken.address, poolStatus.ACTIVE, {
      from: creator,
    });

    // mint token to alice for depositing
    await bnbToken.mint(alice, depositAmount);

    await bnbToken.approve(lendingInstance.address, depositAmount, {
      from: alice,
    });

    // alice deposits bnb token to the pool
    await lendingInstance.deposit(bnbToken.address, depositAmount, {
      from: alice,
    });

    // alice uses bnb token as collateral
    await lendingInstance.setUserUseAsCollateral(bnbToken.address, true, {
      from: alice,
    });

    // alice borrows bnb token from the pool first time
    await lendingInstance.borrow(bnbToken.address, borrowAmount1, {
      from: alice,
    });

    // alice borrows bnb token from the pool second time
    await lendingInstance.borrow(bnbToken.address, borrowAmount2, {
      from: alice,
    });
  });

  it(`Should accumulate pool reserve`, async () => {
    const pools = {
      BNB: {
        tokenInstance: bnbToken,
        totalAvailableLiquidity: BigNumber(200).times(WAD),
        totalLiquidityShares: BigNumber(100).times(WAD),
        totalBorrows: BigNumber(150).times(WAD),
        totalBorrowShares: BigNumber(100).times(WAD),
      },
    };

    // set up pool
    for (const pool of Object.values(pools)) {
      await pool.tokenInstance.mint(lendingInstance.address, pool.totalAvailableLiquidity);

      // mock total supply of alToken
      await lendingInstance.mintAlTokenToPool(
        pool.tokenInstance.address,
        pool.totalLiquidityShares
      );
      await lendingInstance.setPool(
        pool.tokenInstance.address,
        pool.totalBorrows,
        pool.totalBorrowShares
      );
    }

    const userData = {
      BNB: {
        poolAddress: bnbToken.address,
        useAsCollateral: true,
        liquidityShares: BigNumber(20).times(WAD), // 1 liquidity share = 2.9166
        borrowShares: BigNumber(10).times(WAD), // 1 borrow share = 1.5
      },
    };

    // set up user data
    const userDataKeys = Object.keys(userData);
    for (let index = 0; index < userDataKeys.length; index++) {
      const data = userData[userDataKeys[index]];
      await lendingInstance.setUserPool(
        alice,
        data.poolAddress,
        data.useAsCollateral,
        data.borrowShares
      );

      // mint liquidity to user
      await lendingInstance.mintAlTokenToUser(data.poolAddress, alice, data.liquidityShares);
    }

    // set pool to active status
    await lendingInstance.setPoolStatus(bnbToken.address, poolStatus.ACTIVE, {
      from: creator,
    });

    // mint BNB token to user for depositing
    await bnbToken.mint(alice, BigNumber(20).times(WAD));
    await bnbToken.approve(lendingInstance.address, BigNumber(20).times(WAD), {
      from: alice,
    });

    //  time pass 3 months
    await time.increase(time.duration.days(90));

    const expectedPoolReserves1 = BigNumber("383072441019786907");

    await lendingInstance.borrow(bnbToken.address, BigNumber(1).times(WAD), {from: alice});
    let pool = await lendingInstance.pools(bnbToken.address);
    expect(BigNumber(pool.poolReserves)).to.be.bignumber.eq(
      BigNumber(expectedPoolReserves1),
      "Invalid pool's reserves"
    );

    //  time pass 3 months
    await time.increase(time.duration.days(90));

    const expectedPoolReserves2 = BigNumber("412777863467925107").plus(expectedPoolReserves1);

    await lendingInstance.borrow(bnbToken.address, BigNumber(1).times(WAD), {from: alice});
    pool = await lendingInstance.pools(bnbToken.address);
    expect(BigNumber(pool.poolReserves)).to.be.bignumber.eq(
      BigNumber(expectedPoolReserves2),
      "Invalid pool's reserves"
    );
  });
});
