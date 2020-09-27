const {assert} = require("chai");

const AlphaReleaseRule = artifacts.require("AlphaReleaseRule");
const AlphaReleaseRuleSelector = artifacts.require("AlphaReleaseRuleSelector");
const AlphaToken = artifacts.require("AlphaToken");
const MockReceiver = artifacts.require("MockAlphaReceiver");
const truffleAssert = require("truffle-assertions");

contract("AlphaReleaseRuleSelector", ([creator, alice, bob]) => {
  beforeEach(async () => {
    this.alphaToken = await AlphaToken.new();
    this.alphaToken.mint(creator, "100000000000");

    this.rule1 = await AlphaReleaseRule.new(20, 10, [10, 8, 6]);
    this.rule2 = await AlphaReleaseRule.new(10, 10, [10, 8, 6, 4, 2]);
    this.rule3 = await AlphaReleaseRule.new(20, 10, [10, 8, 6, 4, 2, 1]);

    this.receiver1 = await MockReceiver.new(this.alphaToken.address);
    this.receiver2 = await MockReceiver.new(this.alphaToken.address);
    this.receiver3 = await MockReceiver.new(this.alphaToken.address);

    this.selector = await AlphaReleaseRuleSelector.new();
  });

  it("Should add rule and set rule to the receiver correctly", async () => {
    // Add rule#1
    await this.selector.setAlphaReleaseRule(this.receiver1.address, this.rule1.address);
    assert.equal(
      (await this.selector.receiverRuleList.call(0)).receiver.valueOf(),
      this.receiver1.address
    );
    assert.equal((await this.selector.receiverRuleList.call(0)).rule.valueOf(), this.rule1.address);

    // Add rule#2
    await this.selector.setAlphaReleaseRule(this.receiver2.address, this.rule2.address);
    assert.equal(
      (await this.selector.receiverRuleList.call(1)).receiver.valueOf(),
      this.receiver2.address
    );
    assert.equal((await this.selector.receiverRuleList.call(1)).rule.valueOf(), this.rule2.address);
    assert.equal((await this.selector.getreceiverRuleListLength()).valueOf(), "2");
  });

  it("Should add rule and set rule to the receiver correctly (remove first element)", async () => {
    // Add rule#1, #2 and #3
    await this.selector.setAlphaReleaseRule(this.receiver1.address, this.rule1.address);
    await this.selector.setAlphaReleaseRule(this.receiver2.address, this.rule2.address);
    await this.selector.setAlphaReleaseRule(this.receiver3.address, this.rule3.address);

    // Remove receiver#1 -> index = 0
    const tx = await this.selector.removeAlphaReleaseRule(0);
    truffleAssert.eventEmitted(
      tx,
      "AlphaReleaseRuleRemoved",
      (ev) => {
        return (
          ev.index.toString() === "0",
          ev.receiver === this.receiver1.address && ev.rule === this.rule1.address
        );
      },
      "AlphaReleaseRuleRemoved event should be emitted with correct parameters"
    );

    // receiver#3 replace #1
    assert.equal(
      (await this.selector.receiverRuleList.call(0)).receiver.valueOf(),
      this.receiver3.address
    );
    assert.equal(
      (await this.selector.receiverRuleList.call(1)).receiver.valueOf(),
      this.receiver2.address
    );
    assert.equal((await this.selector.getreceiverRuleListLength()).valueOf(), "2");
  });

  it("Should add rule and set rule to the receiver correctly (remove last element)", async () => {
    // Add rule#1, #2 and #3
    await this.selector.setAlphaReleaseRule(this.receiver1.address, this.rule1.address);
    await this.selector.setAlphaReleaseRule(this.receiver2.address, this.rule2.address);
    await this.selector.setAlphaReleaseRule(this.receiver3.address, this.rule3.address);

    // Remove receiver#3 -> index = 2
    const tx = await this.selector.removeAlphaReleaseRule(2);
    truffleAssert.eventEmitted(
      tx,
      "AlphaReleaseRuleRemoved",
      (ev) => {
        return (
          ev.index.toString() === "2",
          ev.receiver === this.receiver3.address && ev.rule === this.rule3.address
        );
      },
      "AlphaReleaseRuleRemoved event should be emitted with correct parameters"
    );
    assert.equal(
      (await this.selector.receiverRuleList.call(0)).receiver.valueOf(),
      this.receiver1.address
    );
    assert.equal(
      (await this.selector.receiverRuleList.call(1)).receiver.valueOf(),
      this.receiver2.address
    );
    assert.equal((await this.selector.getreceiverRuleListLength()).valueOf(), "2");
  });

  it("Should add rule and set rule to the receiver correctly (remove middle element)", async () => {
    // Add rule#1, #2 and #3
    await this.selector.setAlphaReleaseRule(this.receiver1.address, this.rule1.address);
    await this.selector.setAlphaReleaseRule(this.receiver2.address, this.rule2.address);
    await this.selector.setAlphaReleaseRule(this.receiver3.address, this.rule3.address);

    // Remove receiver#2 -> index = 1
    const tx = await this.selector.removeAlphaReleaseRule(1);
    truffleAssert.eventEmitted(
      tx,
      "AlphaReleaseRuleRemoved",
      (ev) => {
        return (
          ev.index.toString() === "1",
          ev.receiver === this.receiver2.address && ev.rule === this.rule2.address
        );
      },
      "AlphaReleaseRuleRemoved event should be emitted with correct parameters"
    );

    assert.equal(
      (await this.selector.receiverRuleList.call(0)).receiver.valueOf(),
      this.receiver1.address
    );
    assert.equal(
      (await this.selector.receiverRuleList.call(1)).receiver.valueOf(),
      this.receiver3.address
    );
    assert.equal((await this.selector.getreceiverRuleListLength()).valueOf(), "2");
  });

  it("Should revert when remove index that out of range", async () => {
    await truffleAssert.reverts(
      this.selector.removeAlphaReleaseRule(100),
      "revert Index out of range"
    );
  });
});
