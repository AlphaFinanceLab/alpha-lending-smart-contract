pragma solidity 0.6.11;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IAlphaReceiver.sol";
import "../interfaces/IAlphaReleaseRule.sol";
import "../interfaces/IAlphaReleaseRuleSelector.sol";

/**
 * @title Alpha rule selector
 * @notice Implements the selector of Alpha rule.
 * @author Alpha
 **/

contract AlphaReleaseRuleSelector is Ownable, IAlphaReleaseRuleSelector {
  address constant HEAD = address(1);

  /**
   * @dev the receiver linked list
   *  receiver address => the next receiver address
   */
  mapping(address => address) public receiverList;
  /**
   * @dev the mapping of receiver address to the Alpha release rule
   *  receiver address => the Alpha release rule
   */
  mapping(address => IAlphaReleaseRule) public rules;
  /**
   * @dev the number of all rules registered to the Alpha release rule selector
   */
  uint256 public ruleCount;

  /**
   * @dev emitted on update Alpha release rule 
   * @param receiver the address of Alpha receiver
   * @param rule the release rule of Alpha receiver
   */
  event AlphaReleaseRuleUpdated(
    address indexed receiver,
    address indexed rule
  );

  constructor() public {
    receiverList[HEAD] = HEAD;
  }

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
    // Add new rules
    if (receiverList[address(_receiver)] == address(0)) {
      receiverList[address(_receiver)] = receiverList[HEAD];
      receiverList[HEAD] = address(_receiver);
      ruleCount++;
    }
    // Set the release rule to the receiver
    rules[address(_receiver)] = _rule;
    emit AlphaReleaseRuleUpdated(address(_receiver), address(_rule));
  }

  /**
   * @dev get the release rule of the receiver
   * @param _receiver the receiver to get the release rule
   */
  function getReleaseRule(IAlphaReceiver _receiver) external view returns (IAlphaReleaseRule) {
    return rules[address(_receiver)];
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
    IAlphaReceiver[] memory receivers = new IAlphaReceiver[](ruleCount);
    uint256[] memory amounts = new uint256[](ruleCount);
    address currentReceivers = receiverList[HEAD];
    for (uint256 i = 0; i < ruleCount; i++) {
      receivers[i] = IAlphaReceiver(currentReceivers);
      IAlphaReleaseRule releaseRule = rules[currentReceivers];
      amounts[i] = releaseRule.getReleaseAmount(_fromBlock, _toBlock);
      currentReceivers = receiverList[currentReceivers];
    }
    return (receivers, amounts);
  }
}
