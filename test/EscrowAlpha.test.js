const AlphaToken = artifacts.require("AlphaToken");
const EscrowAlpha = artifacts.require("EscrowAlpha");
const truffleAssert = require("truffle-assertions");
const {time} = require("@openzeppelin/test-helpers");
const {WAD} = require("./helper.js");
const BigNumber = require("bignumber.js");
const chai = require("chai");
const {expect, assert} = require("chai");
chai.use(require("chai-bignumber")(BigNumber));

contract.only("EscrowAlpha", ([creator, alice, bob, carol]) => {
  const WITHDRAW_PORTION = BigNumber(0.7).times(WAD); // user can withdraw 70% portion
  beforeEach(async () => {
    this.alphaToken = await AlphaToken.new();
    await this.alphaToken.mint(creator, "10000000");
    this.escrow = await EscrowAlpha.new(this.alphaToken.address, WITHDRAW_PORTION);
  });

  it("Should accumulate Alpha to user and user can claim Alpha", async () => {
    await this.alphaToken.approve(this.escrow.address, "10000000");
    // Alice gets 100 Alpha
    await this.escrow.accumulateAlphaToUser(alice, "100");
    // Bob gets 100 Alpha
    await this.escrow.accumulateAlphaToUser(bob, "100");
    // Carol gets 100 Alpha
    await this.escrow.accumulateAlphaToUser(carol, "100");
    // Alice withdraws and should get 70 tokens back
    await this.escrow.claim("100", {from: alice});
    expect(BigNumber(await this.alphaToken.balanceOf(alice))).to.be.bignumber.eq(BigNumber("70"));
    expect(BigNumber(await this.alphaToken.balanceOf(this.escrow.address))).to.be.bignumber.eq(
      BigNumber("230")
    );
    // Bob withdraws half of his share and should get 230/4 = 57, 57*7/10 = 39 tokens back
    await this.escrow.claim("50", {from: bob});
    expect(BigNumber(await this.alphaToken.balanceOf(bob))).to.be.bignumber.eq(BigNumber("39"));
    // Bob gets another 100 Alpha. Should translate to 100*150/191 = 78 share
    await this.escrow.accumulateAlphaToUser(bob, "100");
    expect(BigNumber(await this.escrow.shares(bob))).to.be.bignumber.eq(BigNumber("128"));
    // Carol withdraws all tokens. Should get (400-70-39)*100/236 = 127, 123*7/10 = 88 tokens back
    await this.escrow.claim("100", {from: carol});
    expect(BigNumber(await this.alphaToken.balanceOf(carol))).to.be.bignumber.eq(BigNumber("88"));
    // Bob withdraws all tokens. Should get (400-70-39-88) = 203, 203*7/10 = 142 tokens back (+existing 39)
    await this.escrow.claim("128", {from: bob});
    expect(BigNumber(await this.alphaToken.balanceOf(bob))).to.be.bignumber.eq(BigNumber("181"));
    // Non owner should not be able to recover
    await truffleAssert.reverts(
      this.escrow.recover("61", {from: alice}),
      "Ownable: caller is not the owner"
    );
    await this.escrow.recover("61");
    expect(BigNumber(await this.alphaToken.balanceOf(creator))).to.be.bignumber.eq(
      BigNumber("9999661")
    );
  });
});
