pragma solidity 0.6.11;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../AlTokenDeployer.sol";
import "../LendingPool.sol";

contract MockLendingPool is LendingPool {
  using SafeMath for uint256;

  constructor(AlTokenDeployer _alTokenDeployer) public LendingPool(_alTokenDeployer) {}

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

  function setUserPool(
    address _user,
    ERC20 _token,
    bool _useAsCollateral,
    uint256 _borrowShares
  ) external {
    UserPoolData storage userData = userPoolData[_user][address(_token)];
    userData.useAsCollateral = _useAsCollateral;
    userData.borrowShares = _borrowShares;
  }

  function setPoolReserves(ERC20 _token, uint256 _amount) external {
    Pool storage pool = pools[address(_token)];
    pool.poolReserves = _amount;
  }

  function mintAlToken(ERC20 _token, address  _recipient, uint256 _amount) external {
    Pool storage pool = pools[address(_token)];
    pool.alToken.mint(_recipient, _amount);
  }

  function callAction(ERC20 _token) external updatePoolWithInterestsAndTimestamp(_token) {}
}
