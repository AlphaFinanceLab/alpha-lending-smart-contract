pragma solidity 0.6.11;

import "../interfaces/IAlphaReceiver.sol";
import "../distribution/AlphaToken.sol";

contract MockAlphaReceiver is IAlphaReceiver {
  AlphaToken public alphaToken;

  constructor(AlphaToken _alphaToken) public {
    alphaToken = _alphaToken;
  }

  function receiveAlpha(uint256 _amount) external override {
    alphaToken.transferFrom(msg.sender, address(this), _amount);
  }
}
