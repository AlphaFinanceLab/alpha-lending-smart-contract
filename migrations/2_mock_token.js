const MockBNBToken = artifacts.require("./mock/BNBToken.sol");
const MockBUSDToken = artifacts.require("./mock/BUSDToken.sol");
const MockBTCToken = artifacts.require("./mock/BTCToken.sol");

module.exports = (deployer, network, [owner]) => {
  if (network !== "bscdevelop") return;
  deployer.then(async () => {
    await deployer.deploy(MockBNBToken);
    const bnbToken = await MockBNBToken.deployed();
    await bnbToken.mint(owner, "1000000000000000000000000000");

    await deployer.deploy(MockBUSDToken);
    const busdToken = await MockBUSDToken.deployed();
    await busdToken.mint(owner, "1000000000000000000000000000");

    await deployer.deploy(MockBTCToken);
    const btcToken = await MockBTCToken.deployed();
    await btcToken.mint(owner, "1000000000000000000000000000");
  });
};
