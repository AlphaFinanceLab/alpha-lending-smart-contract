pragma solidity 0.6.11;

import {AlphaToken} from "../distribution/AlphaToken.sol";

/**
 * @title Alpha distributor interface
 * @notice The interface of Alpha distributor for Alpha token rewards
 * @author Alpha
 **/

interface IAlphaDistributor {
  /**
   * @notice get the Alpha token of the distributor
   * @return AlphaToken - the Alpha token
   */
  function alphaToken() external view returns (AlphaToken);

  /**
   * @notice distribute the Alpha token to the receivers
   */
  function poke() external;
}
