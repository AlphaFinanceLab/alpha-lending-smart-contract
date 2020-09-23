pragma solidity 0.6.11;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../interfaces/IAlphaReceiver.sol";
import "../interfaces/IAlphaReleaseRule.sol";
import "../interfaces/IAlphaReleaseRuleSelector.sol";

/**
 * @title Alpha rule selector
 * @notice Implements the selector of Alpha rule.
 * @author Alpha
 **/

contract AlphaReleaseRuleSelector is Ownable, IAlphaReleaseRuleSelector {
  using SafeMath for uint256;

  /**
   * @dev the struct for storing the receiver's rule
   */
  struct ReceiverRule {
    // Alpha receiver
    IAlphaReceiver receiver;
    // release rule
    IAlphaReleaseRule rule;
  }

  /**
   * @dev the list of receivers with rule
   */
  ReceiverRule[] public receiverRuleList;

  /**
   * @dev emitted on update Alpha release rule 
   * @param receiver the address of Alpha receiver
   * @param rule the release rule of Alpha receiver
   */
  event AlphaReleaseRuleUpdated(
    address indexed receiver,
    address indexed rule
  );

  /**
   * @dev emitted on remove Alpha release rule
   * @param receiver the address of receiver
   * @param rule the release rule of Alpha receiver 
   */
  event AlphaReleaseRuleRemoved(
    uint256 indexed index,
    address indexed receiver,
    address indexed rule
  );

  /**
   * @dev set the Alpha release rule to the Alpha token reward receiver
   * @param _receiver the receiver to set the Alpha release rule
   * @param _rule the Alpha release rule of the receiver
   * set Alpha release rule to the receiver and add the receivver to the linked list of receiver
   */
  function setAlphaReleaseRule(IAlphaReceiver _receiver, IAlphaReleaseRule _rule)
    external
    onlyOwner
  {
    ReceiverRule memory receiverRule = ReceiverRule(
      _receiver,
      _rule
    );
    receiverRuleList.push(receiverRule);
    emit AlphaReleaseRuleUpdated(address(_receiver), address(_rule));
  }

  function removeAlphaReleaseRule(uint256 _index)
    external
    onlyOwner
  {
    ReceiverRule storage removedReceiverRule = receiverRuleList[_index];
    receiverRuleList[_index] = receiverRuleList[receiverRuleList.length.sub(1)];
    receiverRuleList.pop();
    emit AlphaReleaseRuleRemoved(_index, address(removedReceiverRule.receiver), address(removedReceiverRule.rule));
  }

  /**
   * @dev get receiverRuleList length
   * @return get receiverRuleList length
   */
  function getreceiverRuleListLength() external view returns (uint256) {
    return receiverRuleList.length;
  }

  /**
   * @dev returns the list of receiver and the list of amount that Alpha token will
   * release to each receiver from _fromBlock to _toBlock
   * @param _fromBlock the start block to release the Alpha token
   * @param _toBlock the end block to release the Alpha token
   * @return the list of Alpha token receiver and the list of amount that will release to each receiver
   */
  function getAlphaReleaseRules(uint256 _fromBlock, uint256 _toBlock)
    external
    override
    view
    returns (IAlphaReceiver[] memory, uint256[] memory)
  {
    IAlphaReceiver[] memory receivers = new IAlphaReceiver[](receiverRuleList.length);
    uint256[] memory amounts = new uint256[](receiverRuleList.length);
    for (uint256 i = 0; i < receiverRuleList.length; i++) {
      ReceiverRule storage receiverRule = receiverRuleList[i];
      receivers[i] = IAlphaReceiver(receiverRule.receiver);
      amounts[i] = receiverRule.rule.getReleaseAmount(_fromBlock, _toBlock);
    }
    return (receivers, amounts);
  }
}
