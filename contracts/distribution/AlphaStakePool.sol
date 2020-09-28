// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.6.11;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IAlphaReceiver.sol";
import "../interfaces/IVestingAlpha.sol";
import "../interfaces/ILendingPool.sol";
import "../AlToken.sol";

/**
 * @title Alpha staking pool contract
 * @notice Implements Alpha staking pool contracts
 * @author Alpha
 */

contract AlphaStakePool is ERC20("AlphaStake", "ALPHASTAKE"), Ownable, IAlphaReceiver, ReentrancyGuard {
  using SafeMath for uint256;

  /**
   * @dev AlAlpha token
   */
  AlToken public alAlphaToken;
  /**
  * @dev alpha distributor contract.
  */
  IAlphaDistributor public distributor;
  /**
   * @dev VestingAlpha address
   */
  IVestingAlpha public vestingAlpha;

  constructor(AlToken _alAlphaToken, IAlphaDistributor _distributor) public {
    alAlphaToken = _alAlphaToken;
    distributor = _distributor;
  }

  /**
    @dev set alAlpha token
   */
  function setAlAlphaToken(AlToken _alAlphaToken) public onlyOwner {
    alAlphaToken = _alAlphaToken;
  }

  /**
    @dev set distributor address
   */
  function setDistributor(IAlphaDistributor _distributor) public onlyOwner {
    distributor = _distributor;
  }

  /**
    @dev set vesting alpha address
   */
  function setVestingAlpha(IVestingAlpha _vestingAlpha) public onlyOwner {
    vestingAlpha = _vestingAlpha;
  }

  /**
   * @dev stake Alpha token to the staking pool
   * @param _amount the amount to stake
   * when user stake Alpha token to the staking pool then they will got the ALPHASTAKE token
   * which can use to clain their Alpha token from the staking pool
   */
  function stake(uint256 _amount) public nonReentrant {
    uint256 total = alAlphaToken.balanceOf(address(this));
    uint256 totalShares = totalSupply();
    alAlphaToken.transferFrom(msg.sender, address(this), _amount);
    if (total == 0 || totalShares == 0) {
      _mint(msg.sender, _amount);
    } else {
      _mint(msg.sender, _amount.mul(totalShares).div(total));
    }
  }

  /**
   * @dev unstake Alpha token from the staking pool
   * @param _share the amount to stake token
   * when user unstake their token, the stake token will be burned.
   * user got the receipt to claim Alpha token after lock time period
   */
  function unstake(uint256 _share) public nonReentrant {
    uint256 totalShares = totalSupply();
    uint256 reward = _share.mul(alAlphaToken.balanceOf(address(this))).div(totalShares);
    _burn(msg.sender, _share);
    if (address(vestingAlpha) == address(0)) {
      alAlphaToken.transfer(msg.sender, reward);
    } else {
      alAlphaToken.approve(address(vestingAlpha), reward);
      vestingAlpha.accumulateAlphaToUser(msg.sender, reward);
    }
  }

  /**
   * @dev receive Alpha token from caller
   * @param _amount the amount of Alpha token that staking pool will receive
   * the staking pool receive Alpha token from the caller, this will transfer
   * Alpha token from caller
   */
  function receiveAlpha(uint256 _amount) external override {
    require(msg.sender == address(distributor), "Only distributor can call receive Alpha");
    alAlphaToken.transferFrom(msg.sender, address(this), _amount);
  }
}
