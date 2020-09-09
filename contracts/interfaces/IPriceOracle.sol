pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

/**
 * @title Price oracle interface
 * @notice The interface for the price oracle contract.
 * @author Alpha
 **/

interface IPriceOracle {
  /**
   * @notice Returns the latest price of an asset given the asset's address
   * @param _asset the address of asset to get the price (price per unit with 9 decimals)
   * @return price per unit
   **/
  function getAssetPrice(address _asset) external view returns (uint256);
}
