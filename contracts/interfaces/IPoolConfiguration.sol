pragma solidity 0.6.11;

/**
 * @title Pool configuration interface
 * @notice The interface of pool configuration of the ERC20 token pool
 * @author Alpha
 **/

interface IPoolConfiguration {
  /**
   * @notice get optimal utilization rate of the ERC20 token pool
   * @return the optimal utilization
   */
  function getOptimalUtilizationRate() external view returns (uint256);

  /**
   * @notice get base borrow rate of the ERC20 token pool
   * @return the base borrow rate
   */
  function getBaseBorrowRate() external view returns (uint256);

  /**
   * @notice get the liquidation bonus percent to calculate the collateral amount of liquidation
   * @return the liquidation bonus percent
   */
  function getLiquidationBonusPercent() external view returns (uint256);

  /**
   * @notice get the collateral percent which is the percent that the liquidity can use as collateral
   * @return the collateral percent
   */
  function getCollateralPercent() external view returns (uint256);

  /**
   * @notice calculate the annual interest rate
   * @param _totalBorrows the total borrows of the ERC20 token pool
   * @param _totalLiquidity the total liquidity of the ERC20 token of the pool
   * @return borrowInterestRate an annual borrow interest rate
   */
  function calculateInterestRate(uint256 _totalBorrows, uint256 _totalLiquidity)
    external
    view
    returns (uint256 borrowInterestRate);

  /**
   * @notice calculate the utilization rate
   * @param _totalBorrows the total borrows of the ERC20 token pool
   * @param _totalLiquidity the total liquidity of the ERC20 token of the pool
   * @return utilizationRate the utilization rate of the ERC20 pool
   */
  function getUtilizationRate(uint256 _totalBorrows, uint256 _totalLiquidity)
    external
    view
    returns (uint256 utilizationRate);
}
