const AlphaReleaseRule = artifacts.require("./AlphaReleaseRule.sol");
const pool1Curve = require("./data/alpha_pool1_curve.json");
const BigNumber = require("bignumber.js");
const truffleAssert = require("truffle-assertions");
const chai = require("chai");
const {expect, assert} = require("chai");
chai.use(require("chai-bignumber")(BigNumber));

contract("AlphaReleaseRule", (accounts) => {
  const [creator, alice, bob] = accounts;
  let defaultAlphaReleaseRule;
  beforeEach(async () => {
    defaultAlphaReleaseRule = await AlphaReleaseRule.new(
      10,
      17280,
      pool1Curve.alphaTokenPerBlockWeek
    );
  });

  it(`Should get alpha per block of week 3`, async () => {
    const expected = BigNumber("150040625000000000000");
    const tokenPerBlock = await defaultAlphaReleaseRule.tokensPerBlock(3);
    expect(BigNumber(tokenPerBlock)).to.be.bignumber.eq(expected, "Invalid token per block");
  });

  it(`Shouldn't set token per block by other user`, async () => {
    await truffleAssert.reverts(
      defaultAlphaReleaseRule.setTokenPerBlock(3, "1000000000", {from: alice}),
      "revert Ownable: caller is not the owner"
    );
  });

  it(`Should get the number of token to distribute correctly`, async () => {
    // |  |----------------------|  |-----------------------| |----------------------|
    // 60 61                     70 71                     80 81
    //                 |----------------------------------------------|
    //                 67                                            84
    //    |-- 175 per block ------|  |--- 166.25 per block --| |-- 157.935 per block -|
    // tokens = (175 * 3) + (166.25 * 10) + (157.9375 * 4) = 2,819.25

    let customRule = await AlphaReleaseRule.new(60, 10, pool1Curve.alphaTokenPerBlockWeek);
    const distributedToken = await customRule.getReleaseAmount(67, 84);
    expect(BigNumber(distributedToken)).to.be.bignumber.eq(
      BigNumber("2819250000000000000000"),
      "Invalid week by block number"
    );
  });

  it(`Should get the number of token to distribute correctly`, async () => {
    // |    |-----------------------| |-----------------------| |----------------------|
    // 67  68                     77  78                     87  88
    // |----------------------------|----------------|
    // 67                                      84
    // |----    175 per block   ----| |--- 166.25 per block --| |--- 157.935 per block-|
    // tokens = (175 * 10) + (166.25 * 7) = 2913.75

    let customRule = await AlphaReleaseRule.new(67, 10, pool1Curve.alphaTokenPerBlockWeek);
    const distributedToken = await customRule.getReleaseAmount(67, 84);
    expect(BigNumber(distributedToken)).to.be.bignumber.eq(
      BigNumber("2913750000000000000000"),
      "Invalid week by block number"
    );
  });

  it(`Should get the number of token to distribute correctly if from block before start block`, async () => {
    //                  |  |-----------------------| |-----------------------| |----------------------|
    //                 60  61                    70   71                    80  81                   90
    //   |---------|
    //  45         59
    // tokens = 0

    let customRule = await AlphaReleaseRule.new(60, 10, pool1Curve.alphaTokenPerBlockWeek);
    expect(BigNumber(await customRule.getReleaseAmount(45, 59))).to.be.bignumber.eq(
      BigNumber("0"),
      "Invalid week by block number"
    );

    //         |  |-----------------------| |-----------------------| |----------------------|
    //        60  61                    70   71                    80  81                   90
    //   |------------------------|
    //  55                       68
    //            |-- 175 per block ------|
    // tokens = (175 * 8) = 1575

    expect(BigNumber(await customRule.getReleaseAmount(55, 68))).to.be.bignumber.eq(
      BigNumber("1400000000000000000000"),
      "Invalid week by block number"
    );
  });

  it(`Should get the number of token to distribute correctly if to block after last block`, async () => {
    let customRule = await AlphaReleaseRule.new(60, 10, [10, 8, 6]);
    //     |-----------------------| |-----------------------| |----------------------|
    // 60 61                      70  71                   80   81                  90
    //                                                                                |----------------------|
    //                                                                                 90                   99
    // tokens = 0

    expect(BigNumber(await customRule.getReleaseAmount(90, 99))).to.be.bignumber.eq(
      BigNumber("0"),
      "Invalid week by block number"
    );

    //      |-----------------------| |-----------------------| |----------------------|
    // 60   61                    70  71                     80 81                     90
    //                                              |---------------------------------------------------------|
    //                                             76                                                        99
    //                                              |----8----| |----------6-----------|
    // tokens = (4 * 8) + (10 * 6) = 92

    expect(BigNumber(await customRule.getReleaseAmount(76, 99))).to.be.bignumber.eq(
      BigNumber("92"),
      "Invalid week by block number"
    );
  });

  it(`Should find week by block number correctly`, async () => {
    //     |-----------------------|       |-----------------------|      |-----------------------|
    // 10  11                 17290        17291               34570      34571               51850
    const week = await defaultAlphaReleaseRule.findWeekByBlockNumber(18000);
    expect(BigNumber(week)).to.be.bignumber.eq(1, "Invalid week by block number");
  });

  it(`Should find week by block number correctly (edge case - first)`, async () => {
    //     |-----------------------|       |-----------------------|      |-----------------------|
    // 10  11                 17290        17291               34570      34571               51850
    const week = await defaultAlphaReleaseRule.findWeekByBlockNumber(17290);
    expect(BigNumber(week)).to.be.bignumber.eq(1, "Invalid week by block number");
  });

  it(`Should find week by block number correctly (edge case - last)`, async () => {
    //     |-----------------------|       |-----------------------|      |-----------------------|
    // 10  11                 17290        17291               34570      34571               51850
    const week = await defaultAlphaReleaseRule.findWeekByBlockNumber(34569);
    expect(BigNumber(week)).to.be.bignumber.eq(1, "Invalid week by block number");
  });

  it(`Should revert when find week by block (the block is less than start block)`, async () => {
    //     |-----------------------|       |-----------------------|      |-----------------------|
    // 10  11                 17290        17291               34570      34571               51850
    await truffleAssert.reverts(
      defaultAlphaReleaseRule.findWeekByBlockNumber(3),
      "revert the block number must more than or equal start block"
    );
  });

  it(`Should find next week frist block of current week correctly (first block)`, async () => {
    //     |-----------------------|       |-----------------------|      |-----------------------|
    // 10  11                 17290        17291               34570      34571               51850
    const nextWeekBlock = await defaultAlphaReleaseRule.findNextWeekFirstBlock(34570);
    expect(BigNumber(nextWeekBlock)).to.be.bignumber.eq(51850, "Invalid block separator");
  });

  it(`Should find next week frist block of current week correctly (middle)`, async () => {
    //     |-----------------------|       |-----------------------|      |-----------------------|
    // 10  11                 17290        17291               34570      34571               51850
    const nextWeekBlock = await defaultAlphaReleaseRule.findNextWeekFirstBlock(17291);
    expect(BigNumber(nextWeekBlock)).to.be.bignumber.eq(34570, "Invalid block separator");
  });

  it(`Should find next week frist block of current week correctly (last block)`, async () => {
    //     |-----------------------|       |-----------------------|      |-----------------------|
    // 10  11                  17290       17291               34570      34571               51850
    const nextWeekBlock = await defaultAlphaReleaseRule.findNextWeekFirstBlock(51849);
    expect(BigNumber(nextWeekBlock)).to.be.bignumber.eq(51850, "Invalid block separator");
  });

  it(`Should revert when find next week frist block of current week (the block is less than start block)`, async () => {
    //     |-----------------------|       |-----------------------|      |-----------------------|
    // 10  11                  17290        17291              34570      34571               51850
    await truffleAssert.reverts(
      defaultAlphaReleaseRule.findNextWeekFirstBlock(3),
      "revert the block number must more than or equal start block"
    );
  });
});
