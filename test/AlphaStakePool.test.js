const AlphaStakePool = artifacts.require("./AlphaStakePool.sol");
const AlphaToken = artifacts.require("./AlphaToken.sol");
const VestingAlpha = artifacts.require("VestingAlpha");
const MockLendingPool = artifacts.require("MockLendingPool");
const AlTokenDeployer = artifacts.require("AlTokenDeployer");
const MockAlphaDistributor = artifacts.require("MockAlphaDistributor");
const AlphaReleaseRuleSelector = artifacts.require("AlphaReleaseRuleSelector");
const truffleAssert = require("truffle-assertions");
const {time} = require("@openzeppelin/test-helpers");
const BigNumber = require("bignumber.js");
const chai = require("chai");
const {expect, assert} = require("chai");
const {lendingPool} = require("./LendingPoolWithAlphaDistributor.test");
chai.use(require("chai-bignumber")(BigNumber));

contract("AlphaStakePool", (accounts) => {
  const [creator, alice, bob] = accounts;
  const LOCK_TIME = BigNumber(259200);
  let alphaToken;
  let vestingAlpha;
  let alphaStakePool;
  let lendingInstance;
  let alphaDistributor;
  beforeEach(async () => {
    alphaToken = await AlphaToken.new("10000000000000000000");
    alTokenDeployer = await AlTokenDeployer.new();
    lendingInstance = await MockLendingPool.new(alTokenDeployer.address);
    vestingAlpha = await VestingAlpha.new(alphaToken.address, LOCK_TIME);
    alphaStakePool = await AlphaStakePool.new(alphaToken.address, lendingInstance.address);

    const rules = await AlphaReleaseRuleSelector.new();
    alphaDistributor = await MockAlphaDistributor.new(alphaToken.address, rules.address);
    await alphaToken.transfer(alphaDistributor.address, "10000000");
    await lendingInstance.setDistributor(alphaDistributor.address);
  });

  it(`Should stake alpha token correctly, Alice is the first staker`, async () => {
    const amount = BigNumber(1000);
    await alphaToken.transfer(alice, amount, {from: creator});
    await alphaToken.approve(alphaStakePool.address, amount, {from: alice});

    // alice stakes 1000 tokens
    await alphaStakePool.stake(amount, {from: alice});

    // check alice balance
    const aliceAlphaBalance = await alphaToken.balanceOf(alice);
    expect(BigNumber(aliceAlphaBalance)).to.be.bignumber.eq(
      BigNumber(0),
      "Invalid alice's alpha balance"
    );
    const aliceStakeBalance = await alphaStakePool.balanceOf(alice);
    expect(BigNumber(aliceStakeBalance)).to.be.bignumber.eq(
      amount,
      "Invalid alice's stake balance"
    );

    //check staking contract balance
    const poolAlphaBalance = await alphaToken.balanceOf(alphaStakePool.address);
    expect(BigNumber(poolAlphaBalance)).to.be.bignumber.eq(
      amount,
      "Invalid stake pool's alpha balance"
    );

    const poolStake = await alphaStakePool.totalSupply();
    expect(BigNumber(poolStake)).to.be.bignumber.eq(amount, "Invalid stake pool's supply");
  });

  it(`Should stake alpha token correctly, Alice and Bob stake to the pool`, async () => {
    const aliceStake = BigNumber(1000);
    const bobStake = BigNumber(2000);

    // alice holds AlphaToken
    await alphaToken.transfer(alice, aliceStake, {from: creator});
    await alphaToken.approve(alphaStakePool.address, aliceStake, {from: alice});

    // bob holds AlphaToken
    await alphaToken.transfer(bob, bobStake, {from: creator});
    await alphaToken.approve(alphaStakePool.address, bobStake, {from: bob});

    // alice stakes 1000 tokens
    await alphaStakePool.stake(aliceStake, {from: alice});

    // check alice balance
    const aliceAlphaBalance = await alphaToken.balanceOf(alice);
    expect(BigNumber(aliceAlphaBalance)).to.be.bignumber.eq(
      BigNumber(0),
      "Invalid alice's alpha balance"
    );
    const aliceStakeBalance = await alphaStakePool.balanceOf(alice);
    expect(BigNumber(aliceStakeBalance)).to.be.bignumber.eq(
      aliceStake,
      "Invalid alice's stake balance"
    );

    //check staking contract balance
    let poolAlphaBalance = await alphaToken.balanceOf(alphaStakePool.address);
    expect(BigNumber(poolAlphaBalance)).to.be.bignumber.eq(
      aliceStake,
      "Invalid stake pool's alpha balance"
    );

    // bob stakes 1000 tokens
    await alphaStakePool.stake(bobStake, {from: bob});

    // check bob balance
    const bobAlphaBalance = await alphaToken.balanceOf(bob);
    expect(BigNumber(bobAlphaBalance)).to.be.bignumber.eq(
      BigNumber(0),
      "Invalid bob's alpha balance"
    );
    const bobStakeBalance = await alphaStakePool.balanceOf(bob);
    expect(BigNumber(bobStakeBalance)).to.be.bignumber.eq(
      bobStake,
      "Invalid alice's stake balance"
    );

    //check staking contract balance
    poolAlphaBalance = await alphaToken.balanceOf(alphaStakePool.address);
    expect(BigNumber(poolAlphaBalance)).to.be.bignumber.eq(
      aliceStake.plus(bobStake),
      "Invalid stake pool's alpha balance"
    );
  });

  it(`Should unstake alpha token and get alpha token immediately if no vesting has been set`, async () => {
    const stakeAmount = BigNumber(1000);
    const unstakeShares = BigNumber(100);
    await alphaToken.transfer(alice, stakeAmount, {from: creator});
    await alphaToken.approve(alphaStakePool.address, stakeAmount, {from: alice});

    // alice stakes 1000 tokens
    await alphaStakePool.stake(stakeAmount, {from: alice});

    // Receive 300 alpha tokens
    await alphaToken.transfer(alphaDistributor.address, "300", {from: creator});
    await alphaDistributor.giveAlphaToStakePool(alphaStakePool.address, "300");

    // alice unstake 100 tokens
    await alphaStakePool.unstake(unstakeShares, {from: alice});

    // check alice stake token balance
    expect(BigNumber(await alphaStakePool.balanceOf(alice))).to.be.bignumber.eq(
      BigNumber(900),
      "Invalid stake pool's supply"
    );

    expect(BigNumber(await alphaStakePool.totalSupply())).to.be.bignumber.eq(
      BigNumber(900),
      "Invalid stake pool's supply"
    );

    expect(BigNumber(await alphaToken.balanceOf(alice))).to.be.bignumber.eq(BigNumber(130));
  });

  it(`Should claim alpha token, after time passed`, async () => {
    await alphaStakePool.setVestingAlpha(vestingAlpha.address);
    const stakeAmount = BigNumber(1000);
    const unstakeShares = BigNumber(500);
    await alphaToken.transfer(alice, stakeAmount, {from: creator});
    await alphaToken.approve(alphaStakePool.address, stakeAmount, {from: alice});

    // alice stakes 1000 tokens
    await alphaStakePool.stake(stakeAmount, {from: alice});

    // alice unstake 100 tokens
    await alphaStakePool.unstake(unstakeShares, {from: alice});

    await vestingAlpha.createReceipt({from: alice});
    const receiptId = 0;

    time.increase("3000");
    await vestingAlpha.claim(receiptId, {from: alice});

    expect(BigNumber(await alphaToken.balanceOf(alice))).to.be.bignumber.eq(BigNumber(5));
  });

  it(`Shouldn't gain alpha token that had been claimed`, async () => {
    await alphaStakePool.setVestingAlpha(vestingAlpha.address);
    const stakeAmount = BigNumber(1000);
    const unstakeShares = BigNumber(100);
    await alphaToken.transfer(alice, stakeAmount, {from: creator});
    await alphaToken.approve(alphaStakePool.address, stakeAmount, {from: alice});

    // alice stakes 1000 tokens
    await alphaStakePool.stake(stakeAmount, {from: alice});

    // alice unstake 100 tokens
    await alphaStakePool.unstake(unstakeShares, {from: alice});

    await vestingAlpha.createReceipt({from: alice});
    const receiptId = 0;

    // time pass 4 days
    await time.increase(time.duration.days(4));

    // alice claim receipt#0
    await vestingAlpha.claim(receiptId, {from: alice});
    expect(BigNumber(await alphaToken.balanceOf(alice))).to.be.bignumber.eq(BigNumber(100));

    // alice claim receipt#0 again
    await truffleAssert.reverts(
      vestingAlpha.claim(receiptId),
      "This receipt has been claimed all tokens"
    );

    expect(BigNumber(await alphaToken.balanceOf(alice))).to.be.bignumber.eq(BigNumber(100));
  });

  it(`Should receive alpha token from caller`, async () => {
    const amount = BigNumber(1000);
    await alphaToken.transfer(alphaDistributor.address, amount, {from: creator});
    await alphaDistributor.giveAlphaToStakePool(alphaStakePool.address, amount);

    const stakePoolAlphaBalance = await alphaToken.balanceOf(alphaStakePool.address);
    expect(BigNumber(stakePoolAlphaBalance)).to.be.bignumber.eq(
      BigNumber(amount),
      "Invalid stake pool balance"
    );
  });

  it(`Should stake an unstake correctly`, async () => {
    await alphaStakePool.setVestingAlpha(vestingAlpha.address);
    // setup alice account
    await alphaToken.transfer(alice, 100);
    // setup bob account
    await alphaToken.transfer(bob, 100);

    // 100 Alpha 💸 to the pool
    await alphaToken.transfer(alphaStakePool.address, 100);

    // alice stakes 50 Alpha tokens
    await alphaToken.approve(alphaStakePool.address, 50, {from: alice});
    await alphaStakePool.stake(50, {from: alice});
    // 100 - 50 = 50
    expect(BigNumber(await alphaToken.balanceOf(alice))).to.be.bignumber.eq(
      BigNumber(50),
      "Invalid alice balance"
    );
    expect(BigNumber(await alphaStakePool.balanceOf(alice))).to.be.bignumber.eq(
      BigNumber(50),
      "Invalid alice balance"
    );

    // 70 Alpha 💸 to the pool
    await alphaToken.transfer(alphaStakePool.address, 70);

    // alice unstakes 20 stake tokens
    await alphaStakePool.unstake(20, {from: alice});

    // alice create receipt
    await vestingAlpha.createReceipt({from: alice});

    // alice claims 20 stake
    // time pass 4 days
    await time.increase(time.duration.days(4));
    0;
    await vestingAlpha.claim(0, {from: alice});
    expect(BigNumber(await alphaStakePool.balanceOf(alice))).to.be.bignumber.eq(
      BigNumber(30),
      "Invalid alice balance"
    );
    // 50 + 88 = 138
    expect(BigNumber(await alphaToken.balanceOf(alice))).to.be.bignumber.eq(
      BigNumber(138),
      "Invalid alice balance"
    );

    // 10 Alpha 💸 to the pool
    await alphaToken.transfer(alphaStakePool.address, 10);

    // bob stakes 15 Alpha tokens
    await alphaToken.approve(alphaStakePool.address, 15, {from: bob});
    await alphaStakePool.stake(15, {from: bob});
    // 100 - 15 = 85
    expect(BigNumber(await alphaToken.balanceOf(bob))).to.be.bignumber.eq(
      BigNumber(85),
      "Invalid alice balance"
    );
    expect(BigNumber(await alphaStakePool.balanceOf(bob))).to.be.bignumber.eq(
      BigNumber(3),
      "Invalid alice balance"
    );

    // 40 Alpha 💸 to the pool
    await alphaToken.transfer(alphaStakePool.address, 40);
    expect(BigNumber(await alphaToken.balanceOf(alphaStakePool.address))).to.be.bignumber.eq(
      BigNumber(197),
      "Invalid alice balance"
    );

    // alice unstakes 30 stake tokens
    await alphaStakePool.unstake(30, {from: alice});

    // alice create receipt
    await vestingAlpha.createReceipt({from: alice});

    // alice claims 20 stake
    // time pass 4 days
    await time.increase(time.duration.days(4));
    await vestingAlpha.claim(1, {from: alice});
    expect(BigNumber(await alphaStakePool.balanceOf(alice))).to.be.bignumber.eq(
      BigNumber(0),
      "Invalid alice balance"
    );
    // 138 + 179 = 317
    expect(BigNumber(await alphaToken.balanceOf(alice))).to.be.bignumber.eq(
      BigNumber(317),
      "Invalid alice balance"
    );

    // bob unstake 30 stake tokens
    await alphaStakePool.unstake(3, {from: bob});

    // alice create receipt
    await vestingAlpha.createReceipt({from: bob});

    // bob claims 20 stake
    // time pass 4 days
    await time.increase(time.duration.days(4));
    await vestingAlpha.claim(2, {from: bob});
    expect(BigNumber(await alphaStakePool.balanceOf(bob))).to.be.bignumber.eq(
      BigNumber(0),
      "Invalid bob balance"
    );
    // 85 + 18 = 103
    expect(BigNumber(await alphaToken.balanceOf(bob))).to.be.bignumber.eq(
      BigNumber(103),
      "Invalid bob balance"
    );

    expect(BigNumber(await alphaToken.balanceOf(alphaStakePool.address))).to.be.bignumber.eq(
      BigNumber(0),
      "Invalid pool balance"
    );

    expect(BigNumber(await alphaStakePool.totalSupply())).to.be.bignumber.eq(
      BigNumber(0),
      "Invalid pool balance"
    );
  });
});
