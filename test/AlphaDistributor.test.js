const {time} = require("@openzeppelin/test-helpers");
const {assert} = require("chai");
const AlphaDistributor = artifacts.require("AlphaDistributor");
const AlphaToken = artifacts.require("AlphaToken");
const AlphaReleaseRule = artifacts.require("AlphaReleaseRule");
const AlphaReleaseRuleSelector = artifacts.require("AlphaReleaseRuleSelector");
const MockReceiver = artifacts.require("MockAlphaReceiver");

contract("AlphaDistributor", ([creator, alice, bob]) => {
  beforeEach(async () => {
    this.alphaToken = await AlphaToken.new();
    this.alphaToken.mint(creator, "100000000000");

    this.block = (await web3.eth.getBlock("latest")).number;

    const rule1 = await AlphaReleaseRule.new(this.block + 20, 10, [10, 8, 6]);
    const rule2 = await AlphaReleaseRule.new(this.block + 30, 10, [10, 8, 6, 4, 2]);

    this.receiver1 = await MockReceiver.new(this.alphaToken.address);
    this.receiver2 = await MockReceiver.new(this.alphaToken.address);

    this.rules = await AlphaReleaseRuleSelector.new();
    await this.rules.setAlphaReleaseRule(this.receiver1.address, rule1.address);
    await this.rules.setAlphaReleaseRule(this.receiver2.address, rule2.address);
    this.alphaDistributor = await AlphaDistributor.new(this.alphaToken.address, this.rules.address);
    await this.alphaToken.transfer(this.alphaDistributor.address, 1000);
  });

  it("Should not distribute only after distribute start time", async () => {
    await time.advanceBlockTo(this.block + 10);
    await this.alphaDistributor.poke();
    assert.equal(
      (await this.alphaToken.balanceOf(this.alphaDistributor.address)).valueOf(),
      "1000"
    );
    assert.equal((await this.alphaToken.balanceOf(this.receiver1.address)).valueOf(), "0");
    assert.equal((await this.alphaToken.balanceOf(this.receiver2.address)).valueOf(), "0");
  });

  it("Should distribute correctly", async () => {
    await time.advanceBlockTo(this.block + 24);
    await this.alphaDistributor.poke(); // block: start+25
    assert.equal((await this.alphaToken.balanceOf(this.alphaDistributor.address)).valueOf(), "950");
    assert.equal((await this.alphaToken.balanceOf(this.receiver1.address)).valueOf(), "50");
    assert.equal((await this.alphaToken.balanceOf(this.receiver2.address)).valueOf(), "0");

    await time.advanceBlockTo(this.block + 30);
    await this.alphaDistributor.poke(); // block: start+31
    assert.equal((await this.alphaToken.balanceOf(this.alphaDistributor.address)).valueOf(), "882");
    assert.equal((await this.alphaToken.balanceOf(this.receiver1.address)).valueOf(), "108");
    assert.equal((await this.alphaToken.balanceOf(this.receiver2.address)).valueOf(), "10");

    await time.advanceBlockTo(this.block + 36);
    await this.alphaDistributor.poke(); // block: start+37
    assert.equal((await this.alphaToken.balanceOf(this.alphaDistributor.address)).valueOf(), "774");
    assert.equal((await this.alphaToken.balanceOf(this.receiver1.address)).valueOf(), "156");
    assert.equal((await this.alphaToken.balanceOf(this.receiver2.address)).valueOf(), "70");

    await time.advanceBlockTo(this.block + 42);
    await this.alphaDistributor.poke(); // block: start+43
    assert.equal((await this.alphaToken.balanceOf(this.alphaDistributor.address)).valueOf(), "678");
    assert.equal((await this.alphaToken.balanceOf(this.receiver1.address)).valueOf(), "198");
    assert.equal((await this.alphaToken.balanceOf(this.receiver2.address)).valueOf(), "124");

    await time.advanceBlockTo(this.block + 48);
    await this.alphaDistributor.poke(); // block: start+49
    assert.equal((await this.alphaToken.balanceOf(this.alphaDistributor.address)).valueOf(), "594");
    assert.equal((await this.alphaToken.balanceOf(this.receiver1.address)).valueOf(), "234");
    assert.equal((await this.alphaToken.balanceOf(this.receiver2.address)).valueOf(), "172");

    await time.advanceBlockTo(this.block + 54);
    await this.alphaDistributor.poke(); // block: start+55
    assert.equal((await this.alphaToken.balanceOf(this.alphaDistributor.address)).valueOf(), "550");
    assert.equal((await this.alphaToken.balanceOf(this.receiver1.address)).valueOf(), "240");
    assert.equal((await this.alphaToken.balanceOf(this.receiver2.address)).valueOf(), "210");

    await time.advanceBlockTo(this.block + 60);
    await this.alphaDistributor.poke(); // block: start+61
    assert.equal((await this.alphaToken.balanceOf(this.alphaDistributor.address)).valueOf(), "516");
    assert.equal((await this.alphaToken.balanceOf(this.receiver1.address)).valueOf(), "240");
    assert.equal((await this.alphaToken.balanceOf(this.receiver2.address)).valueOf(), "244");

    await time.advanceBlockTo(this.block + 200);
    await this.alphaDistributor.poke(); // block: start+201
    assert.equal((await this.alphaToken.balanceOf(this.alphaDistributor.address)).valueOf(), "460");
    assert.equal((await this.alphaToken.balanceOf(this.receiver1.address)).valueOf(), "240");
    assert.equal((await this.alphaToken.balanceOf(this.receiver2.address)).valueOf(), "300");

    // Nothing change
    await time.advanceBlockTo(this.block + 201);
    await this.alphaDistributor.poke(); // block: start+201
    assert.equal((await this.alphaToken.balanceOf(this.alphaDistributor.address)).valueOf(), "460");
    assert.equal((await this.alphaToken.balanceOf(this.receiver1.address)).valueOf(), "240");
    assert.equal((await this.alphaToken.balanceOf(this.receiver2.address)).valueOf(), "300");
  });

  it("Should able to distribute all allocation tokens", async () => {
    await time.advanceBlockTo(this.block + 200);
    await this.alphaDistributor.poke(); // block: start+201
    assert.equal((await this.alphaToken.balanceOf(this.alphaDistributor.address)).valueOf(), "460");
    assert.equal((await this.alphaToken.balanceOf(this.receiver1.address)).valueOf(), "240");
    assert.equal((await this.alphaToken.balanceOf(this.receiver2.address)).valueOf(), "300");
  });

  it("Should withdraw Alpha token to admin", async () => {
    const amount = 100000;
    await this.alphaToken.transfer(this.alphaDistributor.address, amount);
    const balanceBefore = (await this.alphaToken.balanceOf(creator)).valueOf();
    await this.alphaDistributor.withdrawAlpha(amount);
    const balanceAfter = (await this.alphaToken.balanceOf(creator)).valueOf();
    assert.equal(balanceAfter - balanceBefore, amount);
  });
});
