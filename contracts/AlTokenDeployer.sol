// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.6.11;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./interfaces/ILendingPool.sol";
import "./AlToken.sol";

/**
 * @title Alpha token deployer
 * @notice Implements Alpha token deployer
 * @author Alpha
 */

contract AlTokenDeployer {
  /**
   * @dev deploy AlToken for the lending pool
   * @param _name the name of AlToken
   * @param _symbol the token symbol of AlToken
   * @param _underlyingAsset the underlying ERC20 token of the AlToken
   */
  function createNewAlToken(
    string memory _name,
    string memory _symbol,
    ERC20 _underlyingAsset
  ) public returns (AlToken) {
    AlToken alToken = new AlToken(_name, _symbol, ILendingPool(msg.sender), _underlyingAsset);
    alToken.transferOwnership(msg.sender);
    return alToken;
  }
}
