pragma solidity 0.6.11;

import "../distribution/AlphaDistributor.sol";
import "../distribution/AlphaStakePool.sol";

contract MockAlphaDistributor is AlphaDistributor {
  constructor(AlphaToken _alphaToken, IAlphaReleaseRuleSelector _ruleSelector) public AlphaDistributor(_alphaToken, _ruleSelector) {
    alphaToken = _alphaToken;
    ruleSelector = _ruleSelector;
  }

  function giveAlphaToStakePool(AlphaStakePool _alphaStakePool, uint256 _amount) external {
    alphaToken.approve(address(_alphaStakePool), _amount);
    _alphaStakePool.receiveAlpha(_amount);
  }

}