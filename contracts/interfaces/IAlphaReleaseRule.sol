pragma solidity 0.6.11;

/**
 * @title Alpha release rule
 * @notice The interface of Alpha release rule
 * @author Alpha
 **/

interface IAlphaReleaseRule {
  /**
   * @notice get the Alpha token release amount from _fromBlock to _toBlock
   * @param _fromBlock the start block to release Alpha token
   * @param _toBlock the end block to release Alpha token
   * @return the amount od Alpha token to release
   */
  function getReleaseAmount(uint256 _fromBlock, uint256 _toBlock) external view returns (uint256);
}
