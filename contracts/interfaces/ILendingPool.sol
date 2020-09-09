pragma solidity 0.6.11;

import "./IAlphaDistributor.sol";
import "./IVestingAlpha.sol";

/**
 * @title ILendingPool interface
 * @notice The interface for the lending pool contract.
 * @author Alpha
 **/

interface ILendingPool {
  /**
   * @notice Returns the health status of account.
   **/
  function isAccountHealthy(address _account) external view returns (bool);

  /**
   * @notice Returns the Alpha distributor.
   **/
  function distributor() external view returns (IAlphaDistributor);

  /**
   * @notice Returns the Vesting Alpha constract
   **/
  function vestingAlpha() external view returns (IVestingAlpha);
}
