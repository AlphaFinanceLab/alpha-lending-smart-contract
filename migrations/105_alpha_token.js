const AlphaReleaseRule = artifacts.require("AlphaReleaseRule");
const AlphaReleaseRuleSelector = artifacts.require("AlphaReleaseRuleSelector");
const AlphaToken = artifacts.require("AlphaToken");
const LendingPool = artifacts.require("LendingPool");
const AlphaStakePool = artifacts.require("AlphaStakePool");
const AlphaDistributor = artifacts.require("AlphaDistributor");
const VestingAlpha = artifacts.require("VestingAlpha");

const pool1Curve = require("./alpha_pool1_curve.json");
const pool2Curve = require("./alpha_pool2_curve.json");

module.exports = async (deployer, network, accounts) => {
  if (network !== "bsctestnet") return;
  deployer.then(async () => {
    await deployer.deploy(AlphaToken, "100000000000000000000000000");
    const alphaToken = await AlphaToken.deployed();

    // block per week = 604800 / 3 = 201600
    await deployer.deploy(AlphaReleaseRule, 1629150, 2188200, pool1Curve.alphaTokenPerBlockWeek);
    const lendingRule = (await AlphaReleaseRule.deployed()).address;

    // block per week = 604800 / 3 = 201600
    await deployer.deploy(AlphaReleaseRule, 1629150, 2188200, pool2Curve.alphaTokenPerBlockWeek);
    const stakingRule = (await AlphaReleaseRule.deployed()).address;

    const lendingPool = await LendingPool.deployed();
    await deployer.deploy(AlphaStakePool, alphaToken.address);
    const staking = await AlphaStakePool.deployed();

    // Deploy AlphaReleaseRuleSelector
    await deployer.deploy(AlphaReleaseRuleSelector);
    const rules = await AlphaReleaseRuleSelector.deployed();

    await rules.setAlphaReleaseRule(lendingPool.address, lendingRule);
    await rules.setAlphaReleaseRule(staking.address, stakingRule);

    // Deploy AlphaReleaseRuleSelector
    await deployer.deploy(AlphaDistributor, alphaToken.address, rules.address);
    const alphaDistributor = await AlphaDistributor.deployed();

    await alphaToken.transfer(alphaDistributor.address, "30000000000000000000000000");
    await lendingPool.setDistributor(alphaDistributor.address);

    // Deploy vesting alpha contract with 10 minutes locktime.
    await deployer.deploy(VestingAlpha, alphaToken.address, "600");
    const lendingVesting = await VestingAlpha.deployed();
    await lendingPool.setVestingAlpha(lendingVesting.address);

    // Deploy vesting alpha contract with 5 minutes locktime.
    await deployer.deploy(VestingAlpha, alphaToken.address, "300");
    const stakingVesting = await VestingAlpha.deployed();
    await staking.setVestingAlpha(stakingVesting.address);
  });
};
