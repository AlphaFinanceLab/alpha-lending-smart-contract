const AlphaToken = artifacts.require("AlphaToken");
const EscrowAlpha = artifacts.require("EscrowAlpha");
const truffleAssert = require("truffle-assertions");
const {time} = require("@openzeppelin/test-helpers");
const {WAD} = require("./helper.js");
const BigNumber = require("bignumber.js");
const chai = require("chai");
const {expect, assert} = require("chai");
chai.use(require("chai-bignumber")(BigNumber));

contract.only("EscrowAlpha", ([creator, alice, bob]) => {
  const WITHDRAW_PORTION= BigNumber(0.7).times(WAD); // user can withdraw 70% portion
  beforeEach(async () => {
    this.alphaToken = await AlphaToken.new();
    await this.alphaToken.mint(creator, "10000000");
    this.escrow = await EscrowAlpha.new(this.alphaToken.address, WITHDRAW_PORTION);
  });

  it("Should accumulate Alpha to user and user can claim Alpha", async () => {
    // Alice got 100 Alpha
    await this.alphaToken.approve(this.escrow.address, "100");
    await this.escrow.accumulateAlphaToUser(alice, "100");

    // Bob got 100 Alpha
    await this.alphaToken.approve(this.escrow.address, "100");
    await this.escrow.accumulateAlphaToUser(bob, "100");

  })
})
