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

  function burnAlToken(
    ERC20 _token,
    address _user,
    uint256 _amount
  ) external {
    Pool storage pool = pools[address(_token)];
    pool.alToken.burn(_user, _amount);
  }

  function calculateRoundDownLiquidityShareAmountExternal(ERC20 _token, uint256 _amount)
    external
    view
    returns (uint256)
  {
    return calculateRoundDownLiquidityShareAmount(_token, _amount);
  }

  function calculateRoundUpLiquidityShareAmountExternal(ERC20 _token, uint256 _amount)
    external
    view
    returns (uint256)
  {
    return calculateRoundUpLiquidityShareAmount(_token, _amount);
  }

  function calculateRoundUpBorrowShareAmountExternal(ERC20 _token, uint256 _amount)
    external
    view
    returns (uint256)
  {
    return calculateRoundUpBorrowShareAmount(_token, _amount);
  }

  function calculateRoundDownLiquidityAmountExternal(ERC20 _token, uint256 _shareAmount)
    external
    view
    returns (uint256)
  {
    return calculateRoundDownLiquidityAmount(_token, _shareAmount);
  }

  function calculateRoundUpBorrowAmountExternal(ERC20 _token, uint256 _shareAmount)
    external
    view
    returns (uint256)
  {
    return calculateRoundUpBorrowAmount(_token, _shareAmount);
  }

  function calculateRoundDownBorrowShareAmountExternal(ERC20 _token, uint256 _amount)
    external
    view
    returns (uint256)
  {
    return calculateRoundDownBorrowShareAmount(_token, _amount);
  }

  function calculateLinearInterestExternal(
    uint256 _rate,
    uint256 _fromTimestamp,
    uint256 _toTimestamp
  ) external pure returns (uint256) {
    return calculateLinearInterest(_rate, _fromTimestamp, _toTimestamp);
  }

  function calculateCollateralAmountExternal(
    ERC20 _token,
    uint256 _liquidateAmount,
    ERC20 _collateral
  ) external view returns (uint256) {
    return calculateCollateralAmount(_token, _liquidateAmount, _collateral);
  }

  function callAction(ERC20 _token) external updatePoolWithInterestsAndTimestamp(_token) {}

  function splitRewardExternal(ERC20 _token, uint256 _amount)
    external
    view
    returns (uint256 lendersGain, uint256 borrowersGain)
  {
    return splitReward(_token, _amount);
  }
}
