const AlphaToken = artifacts.require("AlphaToken");
const VestingAlpha = artifacts.require("VestingAlpha");
const truffleAssert = require("truffle-assertions");
const {time} = require("@openzeppelin/test-helpers");
const BigNumber = require("bignumber.js");
const chai = require("chai");
const {expect, assert} = require("chai");
chai.use(require("chai-bignumber")(BigNumber));

contract("VestingAlpha", ([creator, alice, bob]) => {
  beforeEach(async () => {
    this.alphaToken = await AlphaToken.new();
    await this.alphaToken.mint(creator, "10000000");
    this.vestingAlpha = await VestingAlpha.new(this.alphaToken.address, "604800");
  });

  context("It should accumulate and create receipt correctly", () => {
    it("Should accumulate Alpha of user", async () => {
      await this.alphaToken.approve(this.vestingAlpha.address, "1000");
      await this.vestingAlpha.accumulateAlphaToUser(alice, "1000");
      assert.equal((await this.vestingAlpha.userAccumulatedAlpha(alice)).valueOf(), "1000");
      assert.equal((await this.alphaToken.balanceOf(this.vestingAlpha.address)).valueOf(), "1000");

      await this.alphaToken.approve(this.vestingAlpha.address, "500");
      await this.vestingAlpha.accumulateAlphaToUser(alice, "500");
      assert.equal((await this.vestingAlpha.userAccumulatedAlpha(alice)).valueOf(), "1500");
      assert.equal((await this.alphaToken.balanceOf(this.vestingAlpha.address)).valueOf(), "1500");
    });

    it("Should create receipt", async () => {
      await this.alphaToken.approve(this.vestingAlpha.address, "1000");
      await this.vestingAlpha.accumulateAlphaToUser(alice, "1000");
      assert.equal((await this.vestingAlpha.userAccumulatedAlpha(alice)).valueOf(), "1000");
      assert.equal((await this.alphaToken.balanceOf(this.vestingAlpha.address)).valueOf(), "1000");

      await this.alphaToken.approve(this.vestingAlpha.address, "500");
      await this.vestingAlpha.accumulateAlphaToUser(alice, "500");
      assert.equal((await this.vestingAlpha.userAccumulatedAlpha(alice)).valueOf(), "1500");
      assert.equal((await this.alphaToken.balanceOf(this.vestingAlpha.address)).valueOf(), "1500");

      await this.vestingAlpha.createReceipt({from: alice});
      const receipt = await this.vestingAlpha.receipts(0);
      assert.equal((await this.vestingAlpha.userAccumulatedAlpha(alice)).valueOf(), "0");
      assert.equal(receipt.recipient.valueOf(), alice);
      assert.equal(receipt.amount.valueOf(), "1500");

      assert.equal((await this.alphaToken.balanceOf(creator)).valueOf(), "9998500");
      assert.equal((await this.alphaToken.balanceOf(this.vestingAlpha.address)).valueOf(), "1500");
      assert.equal((await this.alphaToken.balanceOf(alice)).valueOf(), "0");
    });

    it("Shouldn't crate receipt if user don't have accumulate Alpha token", async () => {
      await truffleAssert.reverts(
        this.vestingAlpha.createReceipt({from: bob}),
        "User don't have accumulate Alpha to create receipt"
      );
    });
  });
  context("It should claim alpha from the receipt", () => {
    beforeEach(async () => {
      await this.alphaToken.approve(this.vestingAlpha.address, "1000");
      await this.vestingAlpha.accumulateAlphaToUser(alice, "1000");
      await this.vestingAlpha.createReceipt({from: alice});
    });

    it("Should not claim on invalid receipt", async () => {
      await truffleAssert.reverts(this.vestingAlpha.claim(2), "Receipt ID not found");
    });

    it("Should claim when time passed", async () => {
      await time.increase("86400");
      // 1/7 of reward should be claimed
      await this.vestingAlpha.claim(0, {from: alice});
      assert.equal((await this.alphaToken.balanceOf(creator)).valueOf(), "9999000");
      assert.equal((await this.alphaToken.balanceOf(this.vestingAlpha.address)).valueOf(), "858");
      assert.equal((await this.alphaToken.balanceOf(alice)).valueOf(), "142");

      // try in 10 minutes.
      await time.increase("600");
      await this.vestingAlpha.claim(0, {from: alice});
      assert.equal((await this.alphaToken.balanceOf(this.vestingAlpha.address)).valueOf(), "857");
      assert.equal((await this.alphaToken.balanceOf(alice)).valueOf(), "143");

      await this.alphaToken.approve(this.vestingAlpha.address, "2000");
      await this.vestingAlpha.accumulateAlphaToUser(bob, "2000");
      await this.vestingAlpha.createReceipt({from: bob});

      // Claim all tokens
      await time.increase("604800");
      await this.vestingAlpha.claim(0, {from: alice});
      assert.equal((await this.alphaToken.balanceOf(this.vestingAlpha.address)).valueOf(), "2000");
      assert.equal((await this.alphaToken.balanceOf(alice)).valueOf(), "1000");
    });

    it("Shouldn't claim if the receipt has been claimed all tokens", async () => {
      // Claim all tokens
      await time.increase("604800");
      await this.vestingAlpha.claim(0, {from: alice});
      assert.equal((await this.alphaToken.balanceOf(this.vestingAlpha.address)).valueOf(), "0");
      assert.equal((await this.alphaToken.balanceOf(alice)).valueOf(), "1000");

      // Claim receipt that has been claim all tokens
      await truffleAssert.reverts(
        this.vestingAlpha.claim(0),
        "This receipt has been claimed all tokens"
      );
    });

    it("Shouldn't claim by other user", async () => {
      await time.increase("302401");
      await truffleAssert.reverts(
        this.vestingAlpha.claim(0, {from: bob}),
        "Only receipt recipient can claim this receipt"
      );
      assert.equal((await this.alphaToken.balanceOf(creator)).valueOf(), "9999000");
      assert.equal((await this.alphaToken.balanceOf(this.vestingAlpha.address)).valueOf(), "1000");
      assert.equal((await this.alphaToken.balanceOf(alice)).valueOf(), "0");
      assert.equal((await this.alphaToken.balanceOf(bob)).valueOf(), "0");
    });
  });
});
