// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.6.11;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IVestingAlpha.sol";
import "./AlphaToken.sol";

/**
 * @title Alpha escrow contract.
 * @author Alpha
 *
 * Implements Alpha escrow contract. Whenever you withdraw, you pay
 * withdraw premium to other existing users who have not withdrawn yet.
 */

contract EscrowAlpha is IVestingAlpha, Ownable, ReentrancyGuard {
  using SafeMath for uint256;

  /**
   * @dev emitted on accumulate Alpha token
   * @param user the account of user
   * @param share the shrare that the user receives
   * @param amount the amount of Alpha token to accumulate
   */
  event AlphaTokenAccumulated(address indexed user, uint256 share, uint256 amount);
  /**
   * @dev emitted on withdraw Alpha token
   * @param user the account of user
   * @param share the shrare that the user burns
   * @param amount the amount of Alpha token that the user receives
   */
  event AlphaTokenWithdrawn(address indexed user, uint256 share, uint256 amount);

  // alpha token
  AlphaToken public alphaToken;
  // user => accumulate vesting share
  mapping(address => uint256) public shares;
  // total share of all users
  uint256 public totalShare;
  // 1e18 - reward withdraw penalty distributed to other token vesters.
  uint256 public withdrawPortion;

  constructor(AlphaToken _alphaToken, uint256 _withdrawPortion) public {
    alphaToken = _alphaToken;
    withdrawPortion = _withdrawPortion;
  }

  /**
   * @dev accumulate Alpha token to user
   * @param _user the user account address
   * @param _amount the amount of Alpha token to accumulate
   */
  function accumulateAlphaToUser(address _user, uint256 _amount) external override nonReentrant {
    uint256 supply = alphaToken.balanceOf(address(this));
    uint256 share = supply == 0 ? _amount : _amount.mul(totalShare).div(supply);
    shares[_user] = shares[_user].add(share);
    totalShare = totalShare.add(share);
    alphaToken.transferFrom(msg.sender, address(this), _amount);
    emit AlphaTokenAccumulated(_user, share, _amount);
  }

  /**
   * @dev claim Alpha token by burning shares (get less because of withdraw premium)
   * @param _share the number of shares to burn and claim Alpha
   */
  function claim(uint256 _share) external nonReentrant {
    uint256 supply = alphaToken.balanceOf(address(this));
    uint256 amount = _share.mul(supply).div(totalShare).mul(withdrawPortion).div(1e18);
    shares[msg.sender] = shares[msg.sender].sub(_share);
    totalShare = totalShare.sub(_share);
    alphaToken.transfer(msg.sender, amount);
    emit AlphaTokenWithdrawn(msg.sender, _share, amount);
  }

  /**
   * @dev recover left-over Alpha token. Must only be called from owner
   * @param _amount the number of Alpha token to withdraw
   */
  function recover(uint256 _amount) external onlyOwner {
    alphaToken.transfer(msg.sender, _amount);
  }

  /**
   * @dev update withdraw portion parameter
   * @param _withdrawPortion the new withdraw portion parameter
   */
  function setwithdrawPortion(uint256 _withdrawPortion) external onlyOwner {
    withdrawPortion = _withdrawPortion;
  }
}
