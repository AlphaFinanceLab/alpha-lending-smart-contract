// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.6.11;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IAlphaDistributor.sol";
import "../interfaces/IAlphaReceiver.sol";
import "../interfaces/IAlphaReleaseRuleSelector.sol";
import "./AlphaToken.sol";

/**
 * @title Alpha distributor contract
 * @notice Implements distributor to poke Alpha token reward to the receiver
 * follow by the Alpha release rules
 * @author Alpha
 */

contract AlphaDistributor is Ownable, ReentrancyGuard, IAlphaDistributor {
  /**
   * @dev the Alpha token to distribute
   */
  AlphaToken public override alphaToken;
  /**
   * @dev the selector of Alpha release rules
   */
  IAlphaReleaseRuleSelector public ruleSelector;
  /**
   * @dev the last block the distributor distribute Alpha token to the receiver
   */
  uint256 public lastPokeBlock;

  /**
   * @dev emitted on update rule selector
   * @param ruleSelector the new rule selector
   */
  event RuleSelectorUpdated(address indexed ruleSelector);

  /**
   * @dev emitted on withdraw Alpha token
   * @param withdrawer the address of withdrawer
   * @param amount the withdraw amount
   */
  event WithdrawAlpha(address indexed withdrawer, uint256 amount);

  constructor(AlphaToken _alphaToken, IAlphaReleaseRuleSelector _ruleSelector) public {
    alphaToken = _alphaToken;
    ruleSelector = _ruleSelector;
  }

  /**
   * @dev set the release rule selector of the distributor
   * @param _ruleSelector the release rule selector
   */
  function setReleaseRuleSelector(IAlphaReleaseRuleSelector _ruleSelector) public onlyOwner {
    ruleSelector = _ruleSelector;
    emit RuleSelectorUpdated(address(ruleSelector));
  }

  /**
   * @dev distributes Alpha token to the receiver from the last distributed block
   * to the latest block forrowing the release rules
   */
  function poke() public override nonReentrant {
    if (lastPokeBlock == block.number) {
      return;
    }
    (IAlphaReceiver[] memory receivers, uint256[] memory values) = ruleSelector
      .getAlphaReleaseRules(lastPokeBlock, block.number);
    lastPokeBlock = block.number;
    require(receivers.length == values.length, "Bad release rule length");
    for (uint256 idx = 0; idx < receivers.length; ++idx) {
      IAlphaReceiver receiver = receivers[idx];
      uint256 value = values[idx];
      alphaToken.approve(address(receiver), value);
      receiver.receiveAlpha(value);
    }
  }

  function withdrawAlpha(uint256 _amount) external onlyOwner {
    alphaToken.transfer(msg.sender, _amount);
    emit WithdrawAlpha(msg.sender, _amount);
  }
}
