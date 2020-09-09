// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.6.11;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title Alpha token contract
 * @notice Implements Alpha token contracts
 * @author Alpha
 */

contract AlphaToken is ERC20("AlphaToken", "ALPHA") {
  constructor(uint256 _totalSupply) public {
    _mint(msg.sender, _totalSupply);
  }
}
