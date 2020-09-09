pragma solidity 0.6.11;

import {IAlphaReceiver} from "./IAlphaReceiver.sol";

/**
 * @title Alpha release rule selector contract
 * @notice Implements Alpha release rule selector contract.
 * @author Alpha
 **/

interface IAlphaReleaseRuleSelector {
  /**
   * @notice get the Alpha token release rules from _fromBlock to _toBlock
   * @param _fromBlock the start block to release Alpha token
   * @param _toBlock the end block to release Alpha token
   * @return receivers - the list of Alpha token receiver, amounts - the list of 
   * amount that each receiver will receive the Alpha token
   */
  function getAlphaReleaseRules(uint256 _fromBlock, uint256 _toBlock)
    external
    view
    returns (IAlphaReceiver[] memory receivers, uint256[] memory amounts);
}
