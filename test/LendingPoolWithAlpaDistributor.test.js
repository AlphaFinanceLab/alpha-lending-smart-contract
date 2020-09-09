const AlTokenDeployer = artifacts.require("./AlTokenDeployer.sol");
const MockLendingPool = artifacts.require("./MockLendingPool.sol");
const MockPriceOracle = artifacts.require("./MockPriceOracle.sol");
const DefaultPoolConfiguration = artifacts.require("./DefaultPoolConfiguration.sol");
const BNBToken = artifacts.require("./mock/BNBToken.sol");
const BUSDToken = artifacts.require("./mock/BUSDToken.sol");
const DAIToken = artifacts.require("./mock/DAIToken.sol");
const AlToken = artifacts.require("./AlToken.sol");
const AlphaToken = artifacts.require("AlphaToken");
const AlphaReleaseRule = artifacts.require("AlphaReleaseRule");
const AlphaReleaseRuleSelector = artifacts.require("AlphaReleaseRuleSelector");
const AlphaDistributor = artifacts.require("AlphaDistributor");

const BigNumber = require("bignumber.js");
const truffleAssert = require("truffle-assertions");
const {WAD, HALF_WAD} = require("./helper.js");
const {time} = require("@openzeppelin/test-helpers");
const chai = require("chai");
const {expect, assert} = require("chai");
chai.use(require("chai-bignumber")(BigNumber));

contract("LendingPool + AlphaDistributor", (accounts) => {
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

  const bnbPricePerUnit = BigNumber(2).times(HALF_WAD);
  const busdPricePerUnit = BigNumber(3).times(HALF_WAD);
  const daiPricePerUnit = BigNumber(4).times(HALF_WAD);

  beforeEach(async () => {
    const alTokenDeployer = await AlTokenDeployer.new();
    this.lendingPool = await MockLendingPool.new(alTokenDeployer.address);
    defaultPoolConfigInstance = await DefaultPoolConfiguration.new(
      BASE_BORROW_RATE,
      SLOPE1_RATE,
      SLOPE2_RATE,
      MAX_LTV,
      LIQUIDATION_BONUS
    );

    // set up BNB token pool
    this.bnbToken = await BNBToken.new();
    await this.lendingPool.initPool(this.bnbToken.address, defaultPoolConfigInstance.address, {
      from: creator,
    });
    const bnbPoolData = await this.lendingPool.getPool(this.bnbToken.address);
    this.alBNBToken = await AlToken.at(bnbPoolData.alTokenAddress);

    // set up BUSD token pool
    this.busdToken = await BUSDToken.new();
    await this.lendingPool.initPool(this.busdToken.address, defaultPoolConfigInstance.address, {
      from: creator,
    });
    // const busdPoolData = await lendingInstance.getPool(this.busdToken.address);
    // this.alBUSDToken = await AlToken.at(busdPoolData.alTokenAddress);

    // set up Dai token pool
    this.daiToken = await DAIToken.new();
    await this.lendingPool.initPool(this.daiToken.address, defaultPoolConfigInstance.address, {
      from: creator,
    });
    // const bnbPoolData = await lendingInstance.getPool(bnbToken.address);
    // this.alBNBToken = await AlToken.at(bnbPoolData.alTokenAddress);

    // set up price oracle
    this.priceOracle = await MockPriceOracle.new();
    await this.lendingPool.setPriceOracle(this.priceOracle.address);
    await this.priceOracle.setAssetPrice(this.bnbToken.address, bnbPricePerUnit);
    await this.priceOracle.setAssetPrice(this.busdToken.address, busdPricePerUnit);
    await this.priceOracle.setAssetPrice(this.daiToken.address, daiPricePerUnit);

    this.block = (await web3.eth.getBlock("latest")).number + 100;

    this.alphaToken = await AlphaToken.new("100000000000000000000000000");
    const lendingRule = await AlphaReleaseRule.new(this.block, 200000, [BigNumber(10).times(WAD)]);
    const rules = await AlphaReleaseRuleSelector.new();
    await rules.setAlphaReleaseRule(this.lendingPool.address, lendingRule.address);

    const alphaDistributor = await AlphaDistributor.new(this.alphaToken.address, rules.address);
    await this.alphaToken.transfer(alphaDistributor.address, "30000000000000000000000000");
    await this.lendingPool.setDistributor(alphaDistributor.address);
  });

  context("Start from fresh lending pool", () => {
    it(`Should deposit user's liquidity to the pool.`, async () => {
      const depositAmount = BigNumber(30).times(WAD);

      // set pool to active status
      await this.lendingPool.setPoolStatus(this.bnbToken.address, poolStatus.ACTIVE, {
        from: creator,
      });

      // mint BNB token to user for depositing
      await this.bnbToken.mint(alice, depositAmount);
      await this.bnbToken.approve(this.lendingPool.address, depositAmount, {
        from: alice,
      });

      await time.advanceBlockTo(this.block + 30);
      // user deposits liquidity to the lending pool
      await this.lendingPool.deposit(this.bnbToken.address, depositAmount, {
        from: alice,
      });

      const expectedShareAmount = depositAmount; // share amount will equals to deposit amount for the first deposit transaction

      // check user alToken balance
      const userAlTokenBalanceAfter = await this.alBNBToken.balanceOf(alice);
      expect(BigNumber(userAlTokenBalanceAfter)).to.be.bignumber.eq(
        expectedShareAmount,
        "Invalid user alToken balance"
      );
      const userBnbTokenBalanceAfter = await this.bnbToken.balanceOf(alice);
      expect(BigNumber(userBnbTokenBalanceAfter)).to.be.bignumber.eq(
        BigNumber(0),
        "Invalid user bnb token balance"
      );

      //check pool's bnb token balance
      const poolBalanceAfter = await this.bnbToken.balanceOf(this.lendingPool.address);
      expect(BigNumber(poolBalanceAfter)).to.be.bignumber.eq(
        depositAmount,
        "Invalid bnb token pool balance"
      );
    });
  });

  context("Get alpha token when interact on lending pool", async () => {
    beforeEach(async () => {
      const pools = [
        {
          tokenInstance: this.bnbToken,
          totalAvailableLiquidity: BigNumber(200).times(WAD),
          totalBorrows: BigNumber(100).times(WAD),
          totalBorrowShares: BigNumber(100).times(WAD),
        },
        {
          tokenInstance: this.busdToken,
          totalAvailableLiquidity: BigNumber(100).times(WAD),
          totalBorrows: BigNumber(50).times(WAD),
          totalBorrowShares: BigNumber(20).times(WAD),
        },
        {
          tokenInstance: this.daiToken,
          totalAvailableLiquidity: BigNumber(100).times(WAD),
          totalBorrows: BigNumber(25).times(WAD),
          totalBorrowShares: BigNumber(10).times(WAD),
        },
      ];
      // Reward pool portion will be 200:150:100 = 4:3:2

      const users = [
        {
          address: alice,
          pools: [
            {
              tokenInstance: this.bnbToken,
              liquidityShares: BigNumber(50).times(WAD),
              borrowShares: BigNumber(20).times(WAD),
            },
            {
              tokenInstance: this.busdToken,
              liquidityShares: BigNumber(50).times(WAD),
              borrowShares: BigNumber(10).times(WAD),
            },
            {
              tokenInstance: this.daiToken,
              liquidityShares: BigNumber(50).times(WAD),
              borrowShares: BigNumber(3).times(WAD),
            },
          ],
        },
        {
          address: bob,
          pools: [
            {
              tokenInstance: this.bnbToken,
              liquidityShares: BigNumber(150).times(WAD),
              borrowShares: BigNumber(80).times(WAD),
            },
            {
              tokenInstance: this.busdToken,
              liquidityShares: BigNumber(60).times(WAD),
              borrowShares: BigNumber(10).times(WAD),
            },
            {
              tokenInstance: this.daiToken,
              liquidityShares: BigNumber(30).times(WAD),
              borrowShares: BigNumber(7).times(WAD),
            },
          ],
        },
      ];

      // set up pool
      for (const pool of pools) {
        // mint deposit tokens
        await pool.tokenInstance.mint(this.lendingPool.address, pool.totalAvailableLiquidity);

        // set borrow value
        await this.lendingPool.setPool(
          pool.tokenInstance.address,
          pool.totalBorrows,
          pool.totalBorrowShares
        );

        // set pool to active status
        await this.lendingPool.setPoolStatus(pool.tokenInstance.address, poolStatus.ACTIVE, {
          from: creator,
        });
      }

      // set user pool
      for (const user of users) {
        for (const data of user.pools) {
          await this.lendingPool.setUserPool(
            user.address,
            data.tokenInstance.address,
            true,
            data.borrowShares
          );

          // mint liquidity to user
          await this.lendingPool.mintAlTokenToUser(
            data.tokenInstance.address,
            user.address,
            data.liquidityShares
          );
        }
      }
    });

    it(`Should get alpha from being a lender when deposit more`, async () => {
      const depositAmount = BigNumber(200).times(WAD);

      // mint BNB token to user for depositing
      await this.bnbToken.mint(alice, depositAmount);
      await this.bnbToken.approve(this.lendingPool.address, depositAmount, {
        from: alice,
      });

      await time.advanceBlockTo(this.block + 19); // Add 20 block

      // 200 alpha token will be distribute to each pool
      // BNB: 88, BUSD: 66, DAI: 44
      // Each pool will split between lenders and borrowers at utilization 33.33%
      // AlBNB lenders should receive 18.518518518518518498 alpha token

      // user deposits liquidity to the lending pool
      await this.lendingPool.deposit(this.bnbToken.address, depositAmount, {
        from: alice,
      });

      // Acc alpha per token should be 18518518518518518498 * 10 ^12 / (200 * 10 ^18) = 92592592592
      expect(BigNumber(await this.alBNBToken.alphaRewardMultiplier())).to.be.bignumber.eq(
        BigNumber("92592592592"),
        "Alpha reward multiplier must increase"
      );

      // Alice hold liquidity share 50/200 she should get alpha equal to 50 * 10 ^18 * 92592592592 / 10^12 = 4629629629600000000
      expect(BigNumber(await this.alphaToken.balanceOf(alice))).to.be.bignumber.eq(
        BigNumber("4629629629600000000"),
        "Invalid alice alpha token balance"
      );
    });

    it(`Should get alpha from borrow token from the lending pool`, async () => {
      const borrowAmount = BigNumber(10).times(WAD);

      await time.advanceBlockTo(this.block + 19); // Add 20 block
      // 200 alpha token will be distribute to each pool
      // BNB: 88, BUSD: 66, DAI: 44
      // Each pool will split between lenders and borrowers at utilization 33.33%
      // AlBNB borrowers should receive 70.370371208787689356 alpha token

      // bob borrows 10 BNB from the lending pool
      await this.lendingPool.borrow(this.bnbToken.address, borrowAmount, {
        from: bob,
      });

      // Acc alpha per borrow share should be 70370370370370370390 * 10 ^12 / (100 * 10 ^18) = 703703703703
      expect(
        BigNumber((await this.lendingPool.pools.call(this.bnbToken.address)).alphaRewardMultiplier)
      ).to.be.bignumber.eq(BigNumber("703703703703"), "Alpha reward multiplier must increase");

      // Bob hold borrow share 80/100. he should get alpha equal to 56296296296240000000
      expect(BigNumber(await this.alphaToken.balanceOf(bob))).to.be.bignumber.eq(
        BigNumber("56296296296240000000"),
        "Invalid bob alpha token balance"
      );
    });

    it(`Should get alpha when repay token`, async () => {
      const repayAmount = BigNumber(10).times(WAD);

      await time.advanceBlockTo(this.block + 19); // Add 20 block
      // 200 alpha token will be distribute to each pool
      // BNB: 88, BUSD: 66, DAI: 44
      // Each pool will split between lenders and borrowers at utilization 33.33%
      // AlBNB borrowers should receive 70.370371208787689356 alpha token

      // bob borrows 10 BNB from the lending pool
      await this.lendingPool.borrow(this.bnbToken.address, repayAmount, {
        from: bob,
      });

      // Acc alpha per borrow share should be 70370371208787689356 * 10 ^12 / (100 * 10 ^18) = 703703703703
      expect(
        BigNumber((await this.lendingPool.pools(this.bnbToken.address)).alphaRewardMultiplier)
      ).to.be.bignumber.eq(BigNumber("703703703703"), "Alpha reward multiplier must increase");

      // Bob hold borrow share 80/100. he should get alpha equal to 56296296296240000000
      expect(BigNumber(await this.alphaToken.balanceOf(bob))).to.be.bignumber.eq(
        BigNumber("56296296296240000000"),
        "Invalid bob alpha token balance"
      );
    });

    it(`Should get alpha when withdraw token`, async () => {
      const withdrawAmount = BigNumber(200).times(WAD);

      // mint BNB token to user for depositing
      await this.bnbToken.mint(alice, withdrawAmount);
      await this.bnbToken.approve(this.lendingPool.address, withdrawAmount, {
        from: alice,
      });

      await time.advanceBlockTo(this.block + 19); // Add 20 block

      // 200 alpha token will be distribute to each pool
      // BNB: 88, BUSD: 66, DAI: 44
      // Each pool will split between lenders and borrowers at utilization 33.33%
      // AlBNB lenders should receive 18.518518518518518498 alpha token

      // user withdraws liquidity from the lending pool
      await this.lendingPool.withdraw(this.bnbToken.address, withdrawAmount, {
        from: alice,
      });

      // Acc alpha per token should be 18518518518518518498 * 10 ^12 / (200 * 10 ^18) = 92592592592
      expect(BigNumber(await this.alBNBToken.alphaRewardMultiplier())).to.be.bignumber.eq(
        BigNumber("92592592592"),
        "Alpha reward multiplier must increase"
      );

      // Alice hold liquidity share 50/200 she should get alpha equal to 50 * 10 ^18 * 92592592592 / 10^12 = 4629629629600000000
      expect(BigNumber(await this.alphaToken.balanceOf(alice))).to.be.bignumber.eq(
        BigNumber("4629629629600000000"),
        "Invalid alice alpha token balance"
      );
    });

    it(`Should send reward to liquidated user`, async () => {
      // Set bob account to unhealthy
      await this.lendingPool.setUserPool(
        bob,
        this.bnbToken.address,
        false,
        BigNumber(80).times(WAD)
      );
      await this.lendingPool.setUserPool(
        bob,
        this.busdToken.address,
        false,
        BigNumber(10).times(WAD)
      );
      assert.equal(await this.lendingPool.isAccountHealthy(bob), false);

      // mint BUSD token to user for liquidation
      await this.busdToken.mint(alice, BigNumber(100).times(WAD));
      await this.busdToken.approve(this.lendingPool.address, BigNumber(100).times(WAD), {
        from: alice,
      });

      await time.advanceBlockTo(this.block + 19); // Add 20 block
      // 200 alpha token will be distribute to each pool
      // BNB: 88, BUSD: 66, DAI: 44
      // Each pool will split between lenders and borrowers at utilization 33.33%
      // AlBUSD borrowers should receive 52.777777777777777793 alpha token

      // alice liquidate bob's account 10 BUSD borrow shares
      await this.lendingPool.liquidate(
        bob,
        this.busdToken.address,
        BigNumber(5).times(WAD),
        this.daiToken.address,
        {
          from: alice,
        }
      );

      // Acc alpha per borrow share should be 52777777777777777793 * 10 ^12 / (20 * 10 ^18) = 2638888888888
      expect(
        BigNumber((await this.lendingPool.pools(this.busdToken.address)).alphaRewardMultiplier)
      ).to.be.bignumber.eq(BigNumber("2638888888888"), "Alpha reward multiplier must increase");

      // Bob hold borrow share 10/20. he should get alpha from borrowing equal to 26388888888880000000
      // Bob got the reward from collateral token equal to 30 * 10 ^ 18 * 69444444444 / 10 ^ 12 = 2083333333320000000
      //  - DAI's lenders gain 5555555555555555555 -> 5555555555555555555 * 10 ^ 12 / 80 ^ 18 = 69444444444
      // 26388888888880000000 + 2083333333320000000 = 28472222222200000000
      expect(BigNumber(await this.alphaToken.balanceOf(bob))).to.be.bignumber.eq(
        BigNumber("28472222222200000000"),
        "Invalid bob alpha token balance"
      );

      // Alice got the reward from collateral token equals to 50 * 10 ^ 18 * 69444444444 / 10 ^ 12 = 34722222222200000000
      // - DAI's lenders gain 5555555555555555555 -> 5555555555555555555 * 10 ^ 12 / 80 ^ 18 = 69444444444
      expect(BigNumber(await this.alphaToken.balanceOf(alice))).to.be.bignumber.eq(
        BigNumber("3472222222200000000"),
        "Invalid bob alpha token balance"
      );
    });

    it(`Should deposit and withdraw then get the rewards correctly`, async () => {
      const depositAmount = BigNumber(200).times(WAD);

      // mint BNB token to user for depositing
      await this.bnbToken.mint(alice, depositAmount);
      await this.bnbToken.approve(this.lendingPool.address, depositAmount, {
        from: alice,
      });

      await time.advanceBlockTo(this.block + 19); // Add 20 block

      // 200 alpha token will be distribute to each pool
      // BNB: 88, BUSD: 66, DAI: 44
      // Each pool will split between lenders and borrowers at utilization 33.33%
      // AlBNB lenders should receive 18.518518518518518498 alpha token

      // user deposits liquidity to the lending pool
      await this.lendingPool.deposit(this.bnbToken.address, depositAmount, {
        from: alice,
      });
      // Alice got 133.333333333333333333 share
      // the BNB's poll total liquidity share will be 200 + 133.333333333333333333 = 333.333333333333333333 share
      // Acc alpha per token should be 18518518518518518498 * 10 ^12 / (200 * 10 ^18) = 92592592592

      await time.advanceBlockTo(this.block + 39); // Add 20 block

      // 200 alpha token will be distribute to each pool
      // BNB: 44, BUSD: 33, DAI: 22

      // BNB pool will split between lenders and borrowers at utilization 20%
      // BUSD pool will split between lenders and borrowers at utilization 33.33%
      // DAI pool will split between lenders and borrowers at utilization 33.33%
      // user withdraws liquidity from the lending pool
      await this.lendingPool.withdraw(this.bnbToken.address, depositAmount, {
        from: alice,
      });

      // lenders gain 11111111111111111110 -> 11111111111111111110 * 10 ^ 12 / 333.333333333333333333 * 10 ^ 18 = 33333333333
      // new acc alpha per token = 92592592592 + 33333333333 = 125925925925
      // Alice hold 183.33/333.33 alBNB Tokens. Alice will got rewards equals to (50 * 10 ^ 18 + 133.333333333333333333 * 10 ^ 18) * 125925925925 / 10 ^ 12 = 23086419752916664320
      // latest reward = 183.333333333333333333 * 10 ^ 18 * 92592592592 / 10 ^ 12 = 16975308641866666666
      // 23086419752916664320 - 16975308641866666666 = 6111111111050000000
      // last reward 4629629629600000000
      // alice reward balance = 4629629629600000000 + 6111111111050000000 = 10740740740650000000
      expect(BigNumber(await this.alphaToken.balanceOf(alice))).to.be.bignumber.eq(
        BigNumber("10740740740650000000"),
        "Invalid bob alpha token balance"
      );
    });
  });
});
