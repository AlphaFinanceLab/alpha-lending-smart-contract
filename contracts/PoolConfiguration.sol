pragma solidity 0.6.11;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./interfaces/IPoolConfiguration.sol";
import "./libraries/WadMath.sol";

/**
 * @title Pool configuration contract
 * @notice Implements the configuration of the ERC20 token pool.
 * @author Alpha
 **/

contract PoolConfiguration is IPoolConfiguration, Ownable {
  using SafeMath for uint256;
  using WadMath for uint256;

  /**
   * @notice the borrow interest rate calculation
   * Borrow interest rate(%)
   *  ^
   *  |             |    /
   *  |             |   /
   *  |             |  /<------ rate slope 2
   *  |             | /
   *  |         ____|/
   *  |    ____/    |
   *  | __/<--------|-------- rate slope 1
   *  |/<-----------|-------- base borrow rate
   *  |-------------|------|  Utilization rate(%)
   *  0             80    100
   *               ^   ^
   *               |   | excess utilization rate
   *               | optimal utilization rate
   *
   * When the utilization rate is too high (over 80%) the the pool will use rate slope 2 to calculate
   * the borrow interest rate which grow very fast to protect the liquidity in the pool.
   */

  uint256 public baseBorrowRate;
  uint256 public rateSlope1;
  uint256 public rateSlope2;
  uint256 public collateralPercent;
  uint256 public liquidationBonusPercent;
  uint256 public optimalUtilizationRate;
  uint256 public excessUtilizationRate;

  constructor(
    uint256 _baseBorrowRate,
    uint256 _rateSlope1,
    uint256 _rateSlope2,
    uint256 _collateralPercent,
    uint256 _liquidationBonusPercent,
    uint256 _optimalUtilizationRate,
    uint256 _excessUtilizationRate
  ) public {
    baseBorrowRate = _baseBorrowRate;
    rateSlope1 = _rateSlope1;
    rateSlope2 = _rateSlope2;
    collateralPercent = _collateralPercent;
    liquidationBonusPercent = _liquidationBonusPercent;
    optimalUtilizationRate = _optimalUtilizationRate;
    excessUtilizationRate = _excessUtilizationRate;
  }

  /**
   * @dev get base borrow rate of the ERC20 token pool
   * @return base borrow rate
   */
  function getBaseBorrowRate() external override(IPoolConfiguration) view returns (uint256) {
    return baseBorrowRate;
  }

  /**
   * @dev get collateral percent of the ERC20 token pool
   * @return collateral percent
   * Basically the collateral percent is the percent that liquidity can be use as collteral to cover the user's loan
   */
  function getCollateralPercent() external override(IPoolConfiguration) view returns (uint256) {
    return collateralPercent;
  }

  /**
   * @dev get the liquidation bonus of the ERC20 token pool
   * @return liquidation bonus percent
   * the liquidation bunus percent used for collateral amount calculation.
   * How many collateral that liquidator will receive when the liquidation is success.
   */
  function getLiquidationBonusPercent()
    external
    override(IPoolConfiguration)
    view
    returns (uint256)
  {
    return liquidationBonusPercent;
  }

  /**
   * @dev calculate the annual interest rate based on utilization rate
   * @param _totalBorrows the total borrows of the ERC20 token pool
   * @param _totalLiquidity the total liquidity of the ERC20 token of the pool
   * First, calculate the utilization rate as below formula
   * utilization rate = total borrows / (total borrows + available liquidity)
   * Second, calculate the annual interest rate
   * As the above graph which show the relative between the utilization rate and the borrow interest rate.
   * There are 2 cases:
   * 1. the utilization rate is less than or equal 80%
   * - the borrow interest rate = base borrow rate + (utilization rate * rate slope 1 / optimal utilization rate)
   * 2. the utilization rate is excessed 80%. In this case the borrow interest rate will be very high.
   * - the excess utilization rate ratio = (utilization rate - optimal utilization rate) / excess utilization rate
   * - the borrow interest rate = base borrow rate + rate slope 1 + (rate slope 2 * excess utilization rate ratio)
   */
  function calculateInterestRate(uint256 _totalBorrows, uint256 _totalLiquidity)
    external
    override(IPoolConfiguration)
    view
    returns (uint256)
  {
    uint256 utilizationRate = getUtilizationRate(_totalBorrows, _totalLiquidity);

    if (utilizationRate > optimalUtilizationRate) {
      uint256 excessUtilizationRateRatio = utilizationRate.sub(optimalUtilizationRate).wadDiv(
        excessUtilizationRate
      );
      return baseBorrowRate.add(rateSlope1).add(rateSlope2.wadMul(excessUtilizationRateRatio));
    } else {
      return
        baseBorrowRate.add(utilizationRate.wadMul(rateSlope1).wadDiv(optimalUtilizationRate));
    }
  }

  /**
   * @dev get optimal utilization rate of the ERC20 token pool
   * @return the optimal utilization
   */
  function getOptimalUtilizationRate() external override view returns (uint256) {
    return optimalUtilizationRate;
  }

  /**
   * @dev calculate the utilization rate
   * @param _totalBorrows the total borrows of the ERC20 token pool
   * @param _totalLiquidity the total liquidity of the ERC20 token of the pool
   * @return utilizationRate the utilization rate of the ERC20 pool
   */
  function getUtilizationRate(uint256 _totalBorrows, uint256 _totalLiquidity)
    public
    override
    view
    returns (uint256)
  {
    return (_totalLiquidity == 0) ? 0 : _totalBorrows.wadDiv(_totalLiquidity);
  }
}
