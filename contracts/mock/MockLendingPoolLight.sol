pragma solidity 0.6.11;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../AlTokenDeployer.sol";
import "../LendingPool.sol";

contract MockLendingPoolLight is LendingPool {
  using SafeMath for uint256;

  constructor(AlTokenDeployer _alTokenDeployer) public LendingPool(_alTokenDeployer) {}

  function mintAlToken(ERC20 _token, address  _recipient, uint256 _amount) external {
    Pool storage pool = pools[address(_token)];
    pool.alToken.mint(_recipient, _amount);
  }

  function burnAlToken(
    ERC20 _token,
    address _user,
    uint256 _amount
  ) external {
    Pool storage pool = pools[address(_token)];
    pool.alToken.burn(_user, _amount);
  }

  function setPool(
    ERC20 _token,
    uint256 _totalBorrows,
    uint256 _totalBorrowShares
  ) external {
    Pool storage pool = pools[address(_token)];
    pool.totalBorrows = _totalBorrows;
    pool.totalBorrowShares = _totalBorrowShares;
    pool.lastUpdateTimestamp = now;
  }

  function setPoolReserves(ERC20 _token, uint256 _amount) external {
    Pool storage pool = pools[address(_token)];
    pool.poolReserves = _amount;
  }


  function giveAlphaToAlToken(ERC20 _token, uint256 _amount) external {
    Pool storage pool = pools[address(_token)];
    distributor.alphaToken().approve(address(pool.alToken), _amount);
    pool.alToken.receiveAlpha(_amount);
  }

  function splitRewardExternal(ERC20 _token, uint256 _amount)
  external
  view
  returns (uint256 lendersGain, uint256 borrowersGain)
  {
    return splitReward(_token, _amount);
  }
}
