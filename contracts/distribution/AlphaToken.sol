// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.6.11;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Alpha token contract
 * @notice Implements Alpha token contracts
 * @author Alpha
 */

contract AlphaToken is ERC20("AlphaToken", "ALPHA"), Ownable {
  function mint(address _to, uint256 _value) public onlyOwner {
    _mint(_to, _value);
  }
}
