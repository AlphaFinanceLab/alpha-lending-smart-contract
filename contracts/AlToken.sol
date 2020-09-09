// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.6.11;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IAlphaReceiver.sol";
import "./interfaces/ILendingPool.sol";
import "./interfaces/IVestingAlpha.sol";

/**
 * @title alToken contract
 * @notice Implements the altoken of the ERC20 token.
 * The alToken represent the liquidity shares of the holder on the ERC20 lending pool.
 * @author Alpha
 **/

contract AlToken is ERC20, Ownable, IAlphaReceiver {
  /**
   * @dev the lending pool of the AlToken
   */
  ILendingPool private lendingPool;

  /**
   * @dev the underlying ERC20 token of the AlToken
   */
  ERC20 public underlyingAsset;

  /**
   * @dev the alpha reward multiplier to calculate Alpha token rewards for the AlToken holder.
   */
  uint256 public alphaRewardMultiplier;

  /**
   * @dev the latest reward of user after latest user activity.
   * Global alphaRewardMultiplier |-----------------|-----------------|--------------->
   * User's latest reward         |-----------------|-----------------|
   *                            start                             last block that user do any activity (received rewards)
   *
   * user address => latest rewards
   */
  mapping(address => uint256) latestRewards;

  constructor(
    string memory _name,
    string memory _symbol,
    ILendingPool _lendingPoolAddress,
    ERC20 _underlyingAsset
  ) public ERC20(_name, _symbol) {
    lendingPool = _lendingPoolAddress;
    underlyingAsset = _underlyingAsset;
  }

  /**
   * @dev mint alToken to the address equal to amount
   * @param _account the account address of receiver
   * @param _amount the amount of alToken to mint
   * Only lending pool can mint alToken
   */
  function mint(address _account, uint256 _amount) external onlyOwner {
    claimCurrentAlphaReward(_account);
    _mint(_account, _amount);
    setLatestReward(_account);
  }

  /**
   * @dev burn alToken of the address equal to amount
   * @param _account the account address that will burn the token
   * @param _amount the amount of alToken to burn
   * Only lending pool can burn alToken
   */
  function burn(address _account, uint256 _amount) external onlyOwner {
    claimCurrentAlphaReward(_account);
    _burn(_account, _amount);
    setLatestReward(_account);
  }

  /**
   * @dev receive Alpha token from the token distributor
   * @param _amount the amount of Alpha to receive
   */
  function receiveAlpha(uint256 _amount) external override {
    lendingPool.distributor().alphaToken().transferFrom(msg.sender, address(this), _amount);
    // Don't change alphaRewardMultiplier if total supply equal zero.
    if (totalSupply() == 0) {
      return;
    }
    alphaRewardMultiplier = alphaRewardMultiplier.add(_amount.mul(1e12).div(totalSupply()));
  }

  /**
   * @dev calculate Alpha reward of the user
   * @param _account the user account address
   * @return the amount of Alpha rewards
   */
  function calculateAlphaReward(address _account) public view returns (uint256) {
    //               reward start block                                        now
    // Global                |----------------|----------------|----------------|
    // User's latest reward    |----------------|----------------|
    // User's Alpha rewards                                    |----------------|
    // reward = (user's Altoken balance * alpha reward multiplier / MULTIPLIER) - user's latest reward
    return balanceOf(_account).mul(alphaRewardMultiplier).div(1e12).sub(latestRewards[_account]);
  }

  /**
   * @dev claim the pending Alpha rewards from the latest rewards giving to now
   * @param _account the user account address
   */
  function claimCurrentAlphaReward(address _account) internal {
    // No op if alpha distributor didn't be set in lending pool.
    if (address(lendingPool.distributor()) == address(0)) {
      return;
    }
    uint256 pending = calculateAlphaReward(_account);
    uint256 alphaBalance = lendingPool.distributor().alphaToken().balanceOf(address(this));
    pending = pending < alphaBalance ? pending : alphaBalance;
    if (address(lendingPool.vestingAlpha()) == address(0)) {
      lendingPool.distributor().alphaToken().transfer(_account, pending);
    } else {
      IVestingAlpha vestingAlpha = lendingPool.vestingAlpha();
      lendingPool.distributor().alphaToken().approve(address(vestingAlpha), pending);
      vestingAlpha.accumulateAlphaToUser(_account, pending);
    }
  }

  /**
   * @dev set the latest reward of the user account
   * @param _account the user account address
   */
  function setLatestReward(address _account) internal {
    // No op if alpha distributor didn't be set in lending pool.
    if (address(lendingPool.distributor()) == address(0)) {
      return;
    }
    latestRewards[_account] = balanceOf(_account).mul(alphaRewardMultiplier).div(1e12);
  }

  /**
   * @dev  transfer alToken to another account
   * @param _from the sender account address
   * @param _to the receiver account address
   * @param _amount the amount of alToken to burn
   * Lending pool will check the account health of the sender. If the sender transfer alTokens to
   * the receiver then the sender account is not healthy, the transfer transaction will be revert.
   * Also claim the user Alpha rewards and set the new user's latest reward
   */
  function _transfer(
    address _from,
    address _to,
    uint256 _amount
  ) internal override {
    claimCurrentAlphaReward(_from);
    claimCurrentAlphaReward(_to);
    super._transfer(_from, _to, _amount);
    require(lendingPool.isAccountHealthy(_from), "Transfer tokens is not allowed");
    setLatestReward(_from);
    setLatestReward(_to);
  }
}
