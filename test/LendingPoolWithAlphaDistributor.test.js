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
const AlphaVesting = artifacts.require("VestingAlpha");

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
          await this.lendingPool.mintAlToken(
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
      expect(BigNumber(await this.alBNBToken.alphaMultiplier())).to.be.bignumber.eq(
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
        BigNumber((await this.lendingPool.pools.call(this.bnbToken.address)).alphaMultiplier)
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
        BigNumber((await this.lendingPool.pools(this.bnbToken.address)).alphaMultiplier)
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
      expect(BigNumber(await this.alBNBToken.alphaMultiplier())).to.be.bignumber.eq(
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
        BigNumber((await this.lendingPool.pools(this.busdToken.address)).alphaMultiplier)
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
      // alice reward balance = 4629629629600000000 + 6111111111050000000 = 10740740740649999999
      expect(BigNumber(await this.alphaToken.balanceOf(alice))).to.be.bignumber.eq(
        BigNumber("10740740740649999999"),
        "Invalid bob alpha token balance"
      );
    });

    it(`Should claim Alpha rewards to the user (lender + borrow rewards)`, async () => {
      // Set vesting contract
      const vesting = await AlphaVesting.new(this.alphaToken.address, "604800");
      await this.lendingPool.setVestingAlpha(vesting.address);

      await time.advanceBlockTo(this.block + 19); // Add 20 block

      // 200 alpha token will be distribute to each pool
      // BNB: 88, BUSD: 66, DAI: 44
      // Each pool will split between lenders and borrowers at utilization 33.33%

      // AlBNB lenders should receive 18.518518518518518498 alpha token
      // Acc per alBNB -> 18518518518518518498 * 10 ^ 12 / (200 * 10 ^ 18) = 92592592592
      // 50 * 10 ^ 18 * 92592592592 / 10 ^ 12 = 4629629629600000000

      // AlBUSD lenders should receive 13.888888888888888873 alpha token
      // Acc per alBUSD -> 13888888888888888873 * 10 ^ 12 / (110 * 10 ^ 18) = 126262626262
      // 50 * 10 ^ 18 * 126262626262 / 10 ^ 12 = 6313131313100000256

      // AlDAI lenders should receive 5.555555555555555555 alpha token
      // Acc per alDAI -> 5555555555555555555 * 10 ^ 12 / (80 * 10 ^ 18) = 69444444444
      // 50 * 10 ^ 18 * 69444444444 / 10 ^ 12 = 3472222222200000000

      // BNB borrower should receive  70.370370370370370390 alpha token
      // Acc per BNB borrow share -> 70370370370370370390 * 10 ^ 12 / 100 * 10 ^ 12 = 703703703703
      // 20 * 10 ^ 18 * 703703703703 / 10 ^ 12 = 14074074074059999232

      // BUSD borrower should 52.777777777777777793 receive alpha token
      // Acc per BUSD -> 52777777777777777793 * 10 ^ 12 / 20 * 10 ^ 18 = 2638888888888
      // 10 * 10 ^ 18 * 2638888888888 / 10 ^ 12 = 26388888888880001024

      // DAI borrower should 38.888888888888888889 receive alpha token
      // Acc per DAI -> 38888888888888888889 * 10 ^ 12 / 10 * 10 ^ 18  = 3888888888888
      // 3 * 10 ^ 18 * 3888888888888 / 10 ^ 12 = 11666666666664001536

      // 4629629629600000000 + 6313131313100000256 + 3472222222200000000 + 14074074074059999232 + 26388888888880001024 + 11666666666664001536
      // = 66544612794504002048
      // 66544612794504000000

      await this.lendingPool.claimAlpha({from: alice});
      await vesting.createReceipt({from: alice});
      const receiptID0 = 0;

      const receipt0 = await vesting.receipts(receiptID0);
      expect(BigNumber(receipt0.amount)).to.be.bignumber.eq(
        BigNumber("66544612794504000000"),
        "Invalid alice alpha token balance"
      );
    });

    it(`Should claim Alpha rewards to user (user claim with create receipt multiple time)`, async () => {
      // Set vesting contract
      const vesting = await AlphaVesting.new(this.alphaToken.address, "604800");
      await this.lendingPool.setVestingAlpha(vesting.address);

      await time.advanceBlockTo(this.block + 19); // Add 20 block

      // 200 alpha token will be distribute to each pool
      // BNB: 88, BUSD: 66, DAI: 44
      // Each pool will split between lenders and borrowers at utilization 33.33%

      // AlBNB lenders should receive 18.518518518518518498 alpha token
      // Acc per alBNB -> 18518518518518518498 * 10 ^ 12 / (200 * 10 ^ 18) = 92592592592
      // 50 * 10 ^ 18 * 92592592592 / 10 ^ 12 = 4629629629600000000

      // AlBUSD lenders should receive 13.888888888888888873 alpha token
      // Acc per alBUSD -> 13888888888888888873 * 10 ^ 12 / (110 * 10 ^ 18) = 126262626262
      // 50 * 10 ^ 18 * 126262626262 / 10 ^ 12 = 6313131313100000256

      // AlDAI lenders should receive 5.555555555555555555 alpha token
      // Acc per alDAI -> 5555555555555555555 * 10 ^ 12 / (80 * 10 ^ 18) = 69444444444
      // 50 * 10 ^ 18 * 69444444444 / 10 ^ 12 = 3472222222200000000

      // BNB borrower should receive  70.370370370370370390 alpha token
      // Acc per BNB borrow share -> 70370370370370370390 * 10 ^ 12 / 100 * 10 ^ 12 = 703703703703
      // 20 * 10 ^ 18 * 703703703703 / 10 ^ 12 = 14074074074059999232

      // BUSD borrower should 52.777777777777777793 receive alpha token
      // Acc per BUSD -> 52777777777777777793 * 10 ^ 12 / 20 * 10 ^ 18 = 2638888888888
      // 10 * 10 ^ 18 * 2638888888888 / 10 ^ 12 = 26388888888880001024

      // DAI borrower should 38.888888888888888889 receive alpha token
      // Acc per DAI -> 38888888888888888889 * 10 ^ 12 / 10 * 10 ^ 18  = 3888888888888
      // 3 * 10 ^ 18 * 3888888888888 / 10 ^ 12 = 11666666666664001536

      // 4629629629600000000 + 6313131313100000256 + 3472222222200000000 + 14074074074059999232 + 26388888888880001024 + 11666666666664001536
      // = 66544612794504002048
      // 66544612794504000000

      await this.lendingPool.claimAlpha({from: alice});
      await vesting.createReceipt({from: alice});
      const receiptID0 = 0;

      const receipt0 = await vesting.receipts(receiptID0);
      expect(BigNumber(receipt0.amount)).to.be.bignumber.eq(
        BigNumber("66544612794504000000"),
        "Invalid alice alpha token balance"
      );

      await time.advanceBlockTo(this.block + 39); // Add 20 block

      // 200 alpha token will be distribute to each pool
      // BNB: 88, BUSD: 66, DAI: 44
      // Each pool will split between lenders and borrowers at utilization 33.33%

      // AlBNB lenders should receive 18.518518518518518498 alpha token
      // Acc per alBNB -> (18518518518518518498 * 10 ^ 12 / (200 * 10 ^ 18)) + 92592592592 = 92592592592 + 92592592592 = 185185185184

      // AlBUSD lenders should receive 13.888888888888888873 alpha token
      // Acc per alBUSD -> (13888888888888888873 * 10 ^ 12 / (110 * 10 ^ 18)) + 126262626262 = 126262626262 + 126262626262 = 252525252524

      // AlDAI lenders should receive 5.555555555555555555 alpha token
      // Acc per alDAI -> (5555555555555555555 * 10 ^ 12 / (80 * 10 ^ 18)) + 69444444444 = 69444444444 + 69444444444 = 138888888888

      // BNB borrower should receive  70.370370370370370390 alpha token
      // Acc per BNB borrow share -> (70370370370370370390 * 10 ^ 12 / 100 * 10 ^ 12) + 703703703703 = 703703703703 + 703703703703 = 1407407407406

      // BUSD borrower should 52.777777777777777793 receive alpha token
      // Acc per BUSD -> (52777777777777777793 * 10 ^ 12 / 20 * 10 ^ 18) + 2638888888888 = 2638888888888 + 2638888888888 = 5277777777776

      // DAI borrower should 38.888888888888888889 receive alpha token
      // Acc per DAI -> (38888888888888888889 * 10 ^ 12 / 10 * 10 ^ 18) + 3888888888888  = 3888888888888 + 3888888888888 = 7777777777776

      // 4629629629600000000 + 6313131313100000256 + 3472222222200000000 + 14074074074059999232 + 26388888888880001024 + 11666666666664001536
      // = 66544612794504002048
      // 66544612794504000000

      // mint BNB token to Bob for depositing
      const depositAmount = BigNumber(200).times(WAD);
      await this.bnbToken.mint(bob, depositAmount);
      await this.bnbToken.approve(this.lendingPool.address, depositAmount, {
        from: bob,
      });

      // Bob deposit 200 BNB tokens
      await this.lendingPool.deposit(this.bnbToken.address, BigNumber(200).times(WAD), {
        from: bob,
      });

      // Global AlBNB's acc Alpha multiplier 111111111110
      // Global AlBUSD's acc Alpha multiplier 151515151514 ?
      // Global AlDAI's acc Alpha multiplier 83333333332 ?

      // 200 alpha token will be distribute to each pool
      // BNB: 88, BUSD: 66, DAI: 44
      // Each pool will split between lenders and borrowers at utilization 33.33%

      // AlBNB lenders should receive 20.370370370370370348 alpha token
      // Acc per alBNB -> (20370370370370370348 * 10 ^ 12 / (200 * 10 ^ 18)) + 92592592592 = 101851851851 + 92592592592 = 194444444443

      // AlBUSD lenders should receive 13.888888888888888873 alpha token
      // Acc per alBUSD -> (13888888888888888873 * 10 ^ 12 / (110 * 10 ^ 18)) + 126262626262 = 126262626262 + 126262626262 = 252525252524

      // AlDAI lenders should receive 5.555555555555555555 alpha token
      // Acc per alDAI -> (5555555555555555555 * 10 ^ 12 / (80 * 10 ^ 18)) + 69444444444 = 69444444444 + 69444444444 = 138888888888

      // BNB borrower should receive  77.407407407407407429 alpha token
      // Acc per BNB borrow share -> (77407407407407407429 * 10 ^ 12 / 100 * 10 ^ 18) + 703703703703 = 774074074074 + 703703703703 = 1477777777777

      // BUSD borrower should 52.777777777777777793 receive alpha token
      // Acc per BUSD -> (52777777777777777793 * 10 ^ 12 / 20 * 10 ^ 18) + 2638888888888 = 2638888888888 + 2638888888888 = 5277777777776

      // DAI borrower should 38.888888888888888889 receive alpha token
      // Acc per DAI -> (38888888888888888889 * 10 ^ 12 / 10 * 10 ^ 18) + 3888888888888  = 3888888888888 + 3888888888888 = 7777777777776

      // 4629629629600000000 + 6313131313100000256 + 3472222222200000000 + 14074074074059999232 + 26388888888880001024 + 11666666666664001536
      // = 66544612794504002048
      // 66544612794504000000

      await time.advanceBlockTo(this.block + 59); // Add 20 block

      // 200 alpha token will be distribute to each pool
      // BNB: 80, BUSD: 60, DAI: 40

      // BNB pool will split between lenders and borrowers at utilization 20%
      // BUSD pool will split between lenders and borrowers at utilization 33.33%
      // DAI pool will split between lenders and borrowers at utilization 33.33%
      // user withdraws liquidity from the lending pool

      // AlBNB lenders should receive 10000000000000000000 alpha token
      // Global's alBNB's Alpha multiplier -> (10000000000000000000 * 10 ^ 12 / (333.33 * 10 ^ 18)) + 194444444443 = 30000000000 + 194444444443 = 224444444443
      // User's BNB last Alpha multiplier -> 92592592592
      // 50 * 10 ^ 18 * (224444444443 - 92592592592) / 10 ^ 12 = 6592592592550000000 6592592592550000000

      // AlBUSD lenders should receive 13.888888888888888873 alpha token
      // Global's alBNB's Alpha multiplier -> (13888888888888888873 * 10 ^ 12 / (110 * 10 ^ 18)) + 252525252524 = 378787878786
      // User's BUSD last Alpha multiplier -> 126262626262
      // 50 * 10 ^ 18 * (378787878786 - 126262626262) / 10 ^ 12 = 12626262626200000000

      // AlDAI lenders should receive 5.555555555555555555 alpha token
      // Acc per alDAI -> 5555555555555555555 * 10 ^ 12 / (80 * 10 ^ 18) + 138888888888 = 208333333332
      // User's DAI last Alpha multiplier -> 69444444444
      // 50 * 10 ^ 18 * (208333333332 - 69444444444) / 10 ^ 12 = 6944444444400000000

      // BNB borrower should receive  70000000000000000000 alpha token
      // Acc per BNB borrow share -> (70000000000000000000 * 10 ^ 12 / 100 * 10 ^ 18) + 1407407407406 = 700000000000 + 1477777777777 = 2177777777777
      // User's BUSD last Alpha multiplier (borrow) -> 703703703703
      // 20 * 10 ^ 18 * (2177777777777 - 703703703703) / 10 ^ 12 = 29481481481480000000

      // BUSD borrower should 52.777777777777777793 receive alpha token
      // Acc per BUSD -> (52777777777777777793 * 10 ^ 12 / 20 * 10 ^ 18) + 5277777777776 = 2638888888888 + 5277777777776 = 7916666666664
      // User's BUSD last Alpha multiplier (borrow) -> 2638888888888
      // 10 * 10 ^ 18 * (7916666666664 - 2638888888888) / 10 ^ 12 = 52777777777770000000

      // DAI borrower should 38.888888888888888889 receive alpha token
      // Acc per DAI -> (38888888888888888889 * 10 ^ 12 / 10 * 10 ^ 18) + 7777777777776 = 3888888888888 + 7777777777776 = 11666666666664
      // User's DAI last Alpha multiplier (borrow) -> 3888888888888
      // 3 * 10 ^ 18 * (11666666666664 - 3888888888888) / 10 ^ 12 = 23333333333331000000

      // 6592592592550000000 + 12626262626200000000 + 6944444444400000000 + 29481481481480000000 + 52777777777770000000 + 23333333333310000000
      // = 131755892255731000000

      // Alice claims Alpha from lending pool
      await this.lendingPool.claimAlpha({from: alice});
      await vesting.createReceipt({from: alice});
      const receiptID1 = 1;

      const receipt1 = await vesting.receipts(receiptID1);
      expect(BigNumber(receipt1.amount)).to.be.bignumber.eq(
        BigNumber("131755892255731000000"),
        "Invalid alice alpha token balance"
      );
    });

    it(`Should claim Alpha rewards to user (user claim multiple times then create receipt)`, async () => {
      // Set vesting contract
      const vesting = await AlphaVesting.new(this.alphaToken.address, "604800");
      await this.lendingPool.setVestingAlpha(vesting.address);

      await time.advanceBlockTo(this.block + 19); // Add 20 block

      // 200 alpha token will be distribute to each pool
      // BNB: 88, BUSD: 66, DAI: 44
      // Each pool will split between lenders and borrowers at utilization 33.33%

      // AlBNB lenders should receive 18.518518518518518498 alpha token
      // Acc per alBNB -> 18518518518518518498 * 10 ^ 12 / (200 * 10 ^ 18) = 92592592592
      // 50 * 10 ^ 18 * 92592592592 / 10 ^ 12 = 4629629629600000000

      // AlBUSD lenders should receive 13.888888888888888873 alpha token
      // Acc per alBUSD -> 13888888888888888873 * 10 ^ 12 / (110 * 10 ^ 18) = 126262626262
      // 50 * 10 ^ 18 * 126262626262 / 10 ^ 12 = 6313131313100000256

      // AlDAI lenders should receive 5.555555555555555555 alpha token
      // Acc per alDAI -> 5555555555555555555 * 10 ^ 12 / (80 * 10 ^ 18) = 69444444444
      // 50 * 10 ^ 18 * 69444444444 / 10 ^ 12 = 3472222222200000000

      // BNB borrower should receive  70.370370370370370390 alpha token
      // Acc per BNB borrow share -> 70370370370370370390 * 10 ^ 12 / 100 * 10 ^ 12 = 703703703703
      // 20 * 10 ^ 18 * 703703703703 / 10 ^ 12 = 14074074074059999232

      // BUSD borrower should 52.777777777777777793 receive alpha token
      // Acc per BUSD -> 52777777777777777793 * 10 ^ 12 / 20 * 10 ^ 18 = 2638888888888
      // 10 * 10 ^ 18 * 2638888888888 / 10 ^ 12 = 26388888888880001024

      // DAI borrower should 38.888888888888888889 receive alpha token
      // Acc per DAI -> 38888888888888888889 * 10 ^ 12 / 10 * 10 ^ 18  = 3888888888888
      // 3 * 10 ^ 18 * 3888888888888 / 10 ^ 12 = 11666666666664001536

      // 4629629629600000000 + 6313131313100000256 + 3472222222200000000 + 14074074074059999232 + 26388888888880001024 + 11666666666664001536
      // = 66544612794504002048
      // 66544612794504000000

      await this.lendingPool.claimAlpha({from: alice});

      await time.advanceBlockTo(this.block + 39); // Add 20 block

      // 200 alpha token will be distribute to each pool
      // BNB: 88, BUSD: 66, DAI: 44
      // Each pool will split between lenders and borrowers at utilization 33.33%

      // AlBNB lenders should receive 18.518518518518518498 alpha token
      // Acc per alBNB -> (18518518518518518498 * 10 ^ 12 / (200 * 10 ^ 18)) + 92592592592 = 92592592592 + 92592592592 = 185185185184

      // AlBUSD lenders should receive 13.888888888888888873 alpha token
      // Acc per alBUSD -> (13888888888888888873 * 10 ^ 12 / (110 * 10 ^ 18)) + 126262626262 = 126262626262 + 126262626262 = 252525252524

      // AlDAI lenders should receive 5.555555555555555555 alpha token
      // Acc per alDAI -> (5555555555555555555 * 10 ^ 12 / (80 * 10 ^ 18)) + 69444444444 = 69444444444 + 69444444444 = 138888888888

      // BNB borrower should receive  70.370370370370370390 alpha token
      // Acc per BNB borrow share -> (70370370370370370390 * 10 ^ 12 / 100 * 10 ^ 12) + 703703703703 = 703703703703 + 703703703703 = 1407407407406

      // BUSD borrower should 52.777777777777777793 receive alpha token
      // Acc per BUSD -> (52777777777777777793 * 10 ^ 12 / 20 * 10 ^ 18) + 2638888888888 = 2638888888888 + 2638888888888 = 5277777777776

      // DAI borrower should 38.888888888888888889 receive alpha token
      // Acc per DAI -> (38888888888888888889 * 10 ^ 12 / 10 * 10 ^ 18) + 3888888888888  = 3888888888888 + 3888888888888 = 7777777777776

      // 4629629629600000000 + 6313131313100000256 + 3472222222200000000 + 14074074074059999232 + 26388888888880001024 + 11666666666664001536
      // = 66544612794504002048
      // 66544612794504000000

      // mint BNB token to Bob for depositing
      const depositAmount = BigNumber(200).times(WAD);
      await this.bnbToken.mint(bob, depositAmount);
      await this.bnbToken.approve(this.lendingPool.address, depositAmount, {
        from: bob,
      });

      // Bob deposit 200 BNB tokens
      await this.lendingPool.deposit(this.bnbToken.address, BigNumber(200).times(WAD), {
        from: bob,
      });

      // 200 alpha token will be distribute to each pool
      // BNB: 88, BUSD: 66, DAI: 44
      // Each pool will split between lenders and borrowers at utilization 33.33%

      // AlBNB lenders should receive 20.370370370370370348 alpha token
      // Acc per alBNB -> (20370370370370370348 * 10 ^ 12 / (200 * 10 ^ 18)) + 92592592592 = 101851851851 + 92592592592 = 194444444443

      // AlBUSD lenders should receive 13.888888888888888873 alpha token
      // Acc per alBUSD -> (13888888888888888873 * 10 ^ 12 / (110 * 10 ^ 18)) + 126262626262 = 126262626262 + 126262626262 = 252525252524

      // AlDAI lenders should receive 5.555555555555555555 alpha token
      // Acc per alDAI -> (5555555555555555555 * 10 ^ 12 / (80 * 10 ^ 18)) + 69444444444 = 69444444444 + 69444444444 = 138888888888

      // BNB borrower should receive  77.407407407407407429 alpha token
      // Acc per BNB borrow share -> (77407407407407407429 * 10 ^ 12 / 100 * 10 ^ 18) + 703703703703 = 774074074074 + 703703703703 = 1477777777777

      // BUSD borrower should 52.777777777777777793 receive alpha token
      // Acc per BUSD -> (52777777777777777793 * 10 ^ 12 / 20 * 10 ^ 18) + 2638888888888 = 2638888888888 + 2638888888888 = 5277777777776

      // DAI borrower should 38.888888888888888889 receive alpha token
      // Acc per DAI -> (38888888888888888889 * 10 ^ 12 / 10 * 10 ^ 18) + 3888888888888  = 3888888888888 + 3888888888888 = 7777777777776

      // 4629629629600000000 + 6313131313100000256 + 3472222222200000000 + 14074074074059999232 + 26388888888880001024 + 11666666666664001536
      // = 66544612794504002048
      // 66544612794504000000

      await time.advanceBlockTo(this.block + 59); // Add 20 block

      // 200 alpha token will be distribute to each pool
      // BNB: 80, BUSD: 60, DAI: 40

      // BNB pool will split between lenders and borrowers at utilization 20%
      // BUSD pool will split between lenders and borrowers at utilization 33.33%
      // DAI pool will split between lenders and borrowers at utilization 33.33%
      // user withdraws liquidity from the lending pool

      // AlBNB lenders should receive 10000000000000000000 alpha token
      // Global's alBNB's Alpha multiplier -> (10000000000000000000 * 10 ^ 12 / (333.33 * 10 ^ 18)) + 194444444443 = 30000000000 + 194444444443 = 224444444443
      // User's BNB last Alpha multiplier -> 92592592592
      // 50 * 10 ^ 18 * (224444444443 - 92592592592) / 10 ^ 12 = 6592592592550000000 6592592592550000000

      // AlBUSD lenders should receive 13.888888888888888873 alpha token
      // Global's alBNB's Alpha multiplier -> (13888888888888888873 * 10 ^ 12 / (110 * 10 ^ 18)) + 252525252524 = 378787878786
      // User's BUSD last Alpha multiplier -> 126262626262
      // 50 * 10 ^ 18 * (378787878786 - 126262626262) / 10 ^ 12 = 12626262626200000000

      // AlDAI lenders should receive 5.555555555555555555 alpha token
      // Acc per alDAI -> 5555555555555555555 * 10 ^ 12 / (80 * 10 ^ 18) + 138888888888 = 208333333332
      // User's DAI last Alpha multiplier -> 69444444444
      // 50 * 10 ^ 18 * (208333333332 - 69444444444) / 10 ^ 12 = 6944444444400000000

      // BNB borrower should receive  70000000000000000000 alpha token
      // Acc per BNB borrow share -> (70000000000000000000 * 10 ^ 12 / 100 * 10 ^ 18) + 1407407407406 = 700000000000 + 1477777777777 = 2177777777777
      // User's BUSD last Alpha multiplier (borrow) -> 703703703703
      // 20 * 10 ^ 18 * (2177777777777 - 703703703703) / 10 ^ 12 = 29481481481480000000

      // BUSD borrower should 52.777777777777777793 receive alpha token
      // Acc per BUSD -> (52777777777777777793 * 10 ^ 12 / 20 * 10 ^ 18) + 5277777777776 = 2638888888888 + 5277777777776 = 7916666666664
      // User's BUSD last Alpha multiplier (borrow) -> 2638888888888
      // 10 * 10 ^ 18 * (7916666666664 - 2638888888888) / 10 ^ 12 = 52777777777770000000

      // DAI borrower should 38.888888888888888889 receive alpha token
      // Acc per DAI -> (38888888888888888889 * 10 ^ 12 / 10 * 10 ^ 18) + 7777777777776 = 3888888888888 + 7777777777776 = 11666666666664
      // User's DAI last Alpha multiplier (borrow) -> 3888888888888
      // 3 * 10 ^ 18 * (11666666666664 - 3888888888888) / 10 ^ 12 = 23333333333331000000

      // 6592592592550000000 + 12626262626200000000 + 6944444444400000000 + 29481481481480000000 + 52777777777770000000 + 23333333333310000000
      // = 131755892255731000000

      // Alice should create receipt with amount equals to 66544612794504000000 + 131755892255731000000 = 198300505050235000000

      // Alice claims Alpha from lending pool
      await this.lendingPool.claimAlpha({from: alice});
      await vesting.createReceipt({from: alice});
      const receiptID0 = 0;

      const receipt0 = await vesting.receipts(receiptID0);
      expect(BigNumber(receipt0.amount)).to.be.bignumber.eq(
        BigNumber("198300505050235000000"),
        "Invalid alice alpha token balance"
      );
    });
  });
});
