pragma solidity 0.6.11;

/**
 * @title Alpha receiver interface
 * @notice The interface of Alpha token reward receiver
 * @author Alpha
 **/

interface IAlphaReceiver {
  /**
   * @notice receive Alpha token from the distributor
   * @param _amount the amount of Alpha token to receive
   */
  function receiveAlpha(uint256 _amount) external;
}
