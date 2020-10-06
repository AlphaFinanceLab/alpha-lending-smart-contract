// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.6.11;

/**
 * @title Alpha vesting interface
 * @notice The interface for the alpha vesting contract.
 * @author Alpha
 */

interface IVestingAlpha {

  /**
   * @dev accumulate Alpha token to user
   * @param _user the user account address
   * @param _amount the amount of Alpha token to accumulate
   */
  function accumulateAlphaToUser(address _user, uint256 _amount) external;
}
