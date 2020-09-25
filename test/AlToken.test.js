const AlToken = artifacts.require("./AlToken.sol");
const MockLendingPool = artifacts.require("./MockLendingPool.sol");
const AlTokenDeployer = artifacts.require("./AlTokenDeployer.sol");
const DefaultPoolConfiguration = artifacts.require("./DefaultPoolConfiguration.sol");
const AlphaToken = artifacts.require("./AlphaToken.sol");
const AlphaDistributor = artifacts.require("./AlphaDistributor.sol");
const AlphaReleaseRuleSelector = artifacts.require("./AlphaReleaseRuleSelector.sol");
const BNBToken = artifacts.require("./mock/BNBToken.sol");
const BigNumber = require("bignumber.js");
const truffleAssert = require("truffle-assertions");
const {WAD} = require("./helper.js");
const chai = require("chai");
const {expect, assert} = require("chai");
chai.use(require("chai-bignumber")(BigNumber));

contract("AlToken", (accounts) => {
  const [creator, alice, bob] = accounts;
  const BASE_BORROW_RATE = BigNumber(0.1).times(WAD); // 10%
  const SLOPE1_RATE = BigNumber(0.2).times(WAD); // 20%
  const SLOPE2_RATE = BigNumber(0.4).times(WAD); // 40%
  const COLLATERAL_PERCENT = BigNumber(0.75).times(WAD); // 75%
  const LIQUIDATION_BONUS = BigNumber(1.05).times(WAD); // 105%

  let lendingInstance;
  let bnbToken;
  let alToken;
  let alphaToken;

  beforeEach(async () => {
    alTokenDeployer = await AlTokenDeployer.new();
    lendingInstance = await MockLendingPool.new(alTokenDeployer.address);
    bnbToken = await BNBToken.new();
    const defaultPoolConfig = await DefaultPoolConfiguration.new(
      BASE_BORROW_RATE,
      SLOPE1_RATE,
      SLOPE2_RATE,
      COLLATERAL_PERCENT,
      LIQUIDATION_BONUS
    );

    //init pool and alToken
    await lendingInstance.initPool(bnbToken.address, defaultPoolConfig.address, {
      from: creator,
    });

    const poolData = await lendingInstance.getPool(bnbToken.address);
    alToken = await AlToken.at(poolData.alTokenAddress);
    alphaToken = await AlphaToken.new(BigNumber(100000).times(WAD));

    const alphaReleaseRuleSelector = await AlphaReleaseRuleSelector.new();
    const alphaDistributor = await AlphaDistributor.new(
      alphaToken.address,
      alphaReleaseRuleSelector.address
    );
    await lendingInstance.setDistributor(alphaDistributor.address);
  });

  it(`Shouldn't mint alToken by other user but only lending pool contract`, async () => {
    const amount = BigNumber(3e18);
    await truffleAssert.reverts(
      alToken.mint(alice, amount, {from: alice}),
      "revert Ownable: caller is not the owner"
    );
  });

  it(`Shouldn't burn alToken by other user but only lending pool contract`, async () => {
    const amount = BigNumber(3e18);
    await truffleAssert.reverts(
      alToken.burn(bob, amount, {from: bob}),
      "revert Ownable: caller is not the owner"
    );
  });

  it(`Should mint or burn alToken and get Alpha token reward`, async () => {
    const aliceAmount1 = BigNumber(1).times(WAD);
    const bobAmount1 = BigNumber(1).times(WAD);

    // alice receive alBNB Token #1
    await lendingInstance.mintAlToken(bnbToken.address, alice, aliceAmount1);
    // bob receive alBNB Token #1
    await lendingInstance.mintAlToken(bnbToken.address, bob, bobAmount1);

    assert.equal((await alToken.balanceOf(alice)).valueOf(), aliceAmount1.toString());
    assert.equal((await alphaToken.balanceOf(alice)).valueOf(), "0");
    assert.equal((await alToken.balanceOf(bob)).valueOf(), bobAmount1.toString());
    assert.equal((await alphaToken.balanceOf(bob)).valueOf(), "0");

    // ----------------------------------------------------------
    // alToken receives 10 Alpha tokens 💸
    const receivedAlphaTokan = BigNumber(10).times(WAD);
    await alphaToken.approve(alToken.address, receivedAlphaTokan, {from: creator});
    await alToken.receiveAlpha(receivedAlphaTokan, {from: creator});
    assert.equal((await alphaToken.balanceOf(alToken.address)).valueOf(), "10000000000000000000");

    // alphaMultiplier = (10 * 10^18) * 10^12 / (2 * 10^18) = 5 * 10 ^12

    // ----------------------------------------------------------
    // alice receive alToken #2
    const aliceAmount2 = BigNumber(2).times(WAD);
    await lendingInstance.mintAlToken(bnbToken.address, alice, aliceAmount2);
    aliceAlpha = await alphaToken.balanceOf(alice);
    // alice got 5 alpha tokens from 1 alToken (first deposit)
    assert.equal((await alphaToken.balanceOf(alice)).valueOf(), "5000000000000000000");
    assert.equal((await alToken.balanceOf(alice)).valueOf(), "3000000000000000000");

    // ----------------------------------------------------------
    // bob burn alToken #3
    const bobAmount3 = BigNumber(0.4).times(WAD);
    await lendingInstance.burnAlToken(bnbToken.address, bob, bobAmount3);
    bobAlpha = await alphaToken.balanceOf(bob);
    // bob got 5 alpha tokens from 1 alToken (first deposit)
    assert.equal((await alphaToken.balanceOf(bob)).valueOf(), "5000000000000000000");
    assert.equal((await alToken.balanceOf(bob)).valueOf(), "600000000000000000");

    // ----------------------------------------------------------
    // alToken receives 6 Alpha tokens 💸 #2
    const receivedAlphaTokan2 = BigNumber(6).times(WAD);
    await alphaToken.approve(alToken.address, receivedAlphaTokan2, {from: creator});
    await alToken.receiveAlpha(receivedAlphaTokan2, {from: creator});

    // alphaMultiplier = 5*10^12 + ((6*10^18 * 10^12) / 3.6 * 10^18) = 6666666666666 * 10^12

    // ----------------------------------------------------------
    // bob mint alToken #4
    const bobAmount4 = BigNumber(1).times(WAD);
    await lendingInstance.mintAlToken(bnbToken.address, bob, bobAmount4);
    // bob should get alpha = (5*10^18) +(0.6 * 10^18) * 6.666 - (0.6) * 5 = 5999999999999600000
    assert.equal((await alphaToken.balanceOf(bob)).valueOf(), "5999999999999600000");
    assert.equal((await alToken.balanceOf(bob)).valueOf(), "1600000000000000000");

    // alToken receives 10 Alpha tokens 💸 #3
    const receivedAlphaTokan3 = BigNumber(10).times(WAD);
    await alphaToken.approve(alToken.address, receivedAlphaTokan3, {from: creator});
    await alToken.receiveAlpha(receivedAlphaTokan3, {from: creator});

    // alphaMultiplier = 6666666666666 + ((10*10^18 * 10^12) / 4.6 * 10^18) = 8840579710144

    // alice burn all alToken #4
    await lendingInstance.burnAlToken(bnbToken.address, alice, BigNumber(3).times(WAD));
    // alice should get alpha = ((3*10^18) * 8840579710144 / 1e12) - ((3*10^18) * 5000000000000 / 1e12) = 11521739130432000000
    // total alpha balance of alice = 5000000000000000000 + 11521739130432000000
    assert.equal((await alphaToken.balanceOf(alice)).valueOf(), "16521739130432000000");
    assert.equal((await alToken.balanceOf(alice)).valueOf(), "0");

    // bob burn all alToken #4
    await lendingInstance.burnAlToken(bnbToken.address, bob, BigNumber(1.6).times(WAD));
    // bob should get alpha = ((1.6*10^18) * 8840579710144 / 1e12) - ((1.6*10^18) * 6666666666666 / 1e12) = 3478260869564800000
    // total alpha balance of bob = 5999999999999600000 + 3478260869564800000
    assert.equal((await alphaToken.balanceOf(bob)).valueOf(), "9478260869564400000");
    assert.equal((await alToken.balanceOf(alice)).valueOf(), "0");
  });
});
