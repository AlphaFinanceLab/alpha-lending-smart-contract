pragma solidity 0.6.11;

import "../interfaces/IPriceOracle.sol";

contract MockPriceOracle is IPriceOracle {
  mapping(address => uint256) public mockPrices;

  function getAssetPrice(address _asset) external override view returns (uint256) {
    return mockPrices[_asset];
  }

  function setAssetPrice(address _asset, uint256 _price) external {
    mockPrices[_asset] = _price;
  }
}
