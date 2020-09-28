pragma solidity 0.6.11;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IAlphaDistributor.sol";
import "./interfaces/IAlphaReceiver.sol";
import "./interfaces/ILendingPool.sol";
import "./interfaces/IPoolConfiguration.sol";
import "./interfaces/IPriceOracle.sol";
import "./interfaces/IVestingAlpha.sol";
import "./AlToken.sol";
import "./AlTokenDeployer.sol";
import "./libraries/WadMath.sol";

/**
 * @title Lending pool contract
 * @notice Implements the core contract of lending pool.
 * this contract manages all states and handles user interaction with the pool.
 * @author Alpha
 **/

contract LendingPool is Ownable, ILendingPool, IAlphaReceiver, ReentrancyGuard {
  using SafeMath for uint256;
  using WadMath for uint256;
  using SafeERC20 for ERC20;

  /*
   * Lending pool smart contracts
   * -----------------------------
   * Each ERC20 token has an individual pool which users provide their liquidity to the pool.
   * Users can use their liquidity as collateral to borrow any asset from all pools if their account is still healthy.
   * By account health checking, the total borrow value must less than the total collateral value (collateral value is
   * ~75% of the liquidity value depends on each token). Borrower need to repay the loan with accumulated interest.
   * Liquidity provider would receive the borrow interest. In case of the user account is not healthy
   * then liquidator can help to liquidate the user's account then receive the collateral with liquidation bonus as the reward.
   *
   * The status of the pool
   * -----------------------------
   * The pool has 3 status. every pool will have only one status at a time.
   * 1. INACTIVE - the pool is on initialized state or inactive state so it's not ready for user to do any actions. users can't deposit, borrow,
   * repay and withdraw
   * 2 .ACTIVE - the pool is active. users can deposit, borrow, repay, withdraw and liquidate
   * 3. CLOSED - the pool is waiting for inactive state. users can clear their account by repaying, withdrawal, liquidation but can't deposit, borrow
   */
  enum PoolStatus {INACTIVE, ACTIVE, CLOSED}
  uint256 internal constant SECONDS_PER_YEAR = 365 days;
  /**
   * @dev emitted on initilize pool
   * @param pool the address of the ERC20 token of the pool
   * @param alTokenAddress the address of the pool's alToken
   * @param poolConfigAddress the address of the pool's configuration contract
   */
  event PoolInitialized(
    address indexed pool,
    address indexed alTokenAddress,
    address indexed poolConfigAddress
  );

  /**
   * @dev emitted on update pool configuration
   * @param pool the address of the ERC20 token of the pool
   * @param poolConfigAddress the address of the updated pool's configuration contract
   */
  event PoolConfigUpdated(address indexed pool, address poolConfigAddress);

  /**
   * @dev emitted on set price oracle
   * @param priceOracleAddress the address of the price oracle
   */
  event PoolPriceOracleUpdated(address indexed priceOracleAddress);

  /**
   * @dev emitted on pool updates interest
   * @param pool the address of the ERC20 token of the pool
   * @param cumulativeBorrowInterest the borrow interest which accumulated from last update timestamp to now
   * @param totalBorrows the updated total borrows of the pool. increasing by the cumulative borrow interest.
   */
  event PoolInterestUpdated(
    address indexed pool,
    uint256 cumulativeBorrowInterest,
    uint256 totalBorrows
  );

  /**
   * @dev emitted on deposit
   * @param pool the address of the ERC20 token of the pool
   * @param user the address of the user who deposit the ERC20 token to the pool
   * @param depositShares the share amount of the ERC20 token which calculated from deposit amount
   * Note: depositShares is the same as number of alphaToken
   * @param depositAmount the amount of the ERC20 that deposit to the pool
   */
  event Deposit(
    address indexed pool,
    address indexed user,
    uint256 depositShares,
    uint256 depositAmount
  );

  /**
   * @dev emitted on borrow
   * @param pool the address of the ERC20 token of the pool
   * @param user the address of the user who borrow the ERC20 token from the pool
   * @param borrowShares the amount of borrow shares which calculated from borrow amount
   * @param borrowAmount the amount of borrow
   */
  event Borrow(
    address indexed pool,
    address indexed user,
    uint256 borrowShares,
    uint256 borrowAmount
  );

  /**
   * @dev emitted on repay
   * @param pool the address of the ERC20 token of the pool
   * @param user the address of the user who repay the ERC20 token to the pool
   * @param repayShares the amount of repay shares which calculated from repay amount
   * @param repayAmount the amount of repay
   */
  event Repay(address indexed pool, address indexed user, uint256 repayShares, uint256 repayAmount);

  /**
   * @dev emitted on withdraw alToken
   * @param pool the address of the ERC20 token of the pool
   * @param user the address of the user who withdraw the ERC20 token from the pool
   * @param withdrawShares the amount of withdraw shares which calculated from withdraw amount
   * @param withdrawAmount the amount of withdraw
   */
  event Withdraw(
    address indexed pool,
    address indexed user,
    uint256 withdrawShares,
    uint256 withdrawAmount
  );

  /**
   * @dev emitted on liquidate
   * @param user the address of the user who is liquidated by liquidator
   * @param pool the address of the ERC20 token which is liquidated by liquidator
   * @param collateral the address of the ERC20 token that liquidator received as a rewards
   * @param liquidateAmount the amount of the ERC20 token that liquidator liquidate for the user
   * @param liquidateShares the amount of liquidate shares which calculated from liquidate amount
   * @param collateralAmount the amount of the collateral which calculated from liquidate amount that liquidator want to liquidate
   * @param collateralShares the amount of collateral shares which liquidator received from liquidation in from of alToken
   * @param liquidator the address of the liquidator
   */
  event Liquidate(
    address indexed user,
    address pool,
    address collateral,
    uint256 liquidateAmount,
    uint256 liquidateShares,
    uint256 collateralAmount,
    uint256 collateralShares,
    address liquidator
  );

  /**
   * @dev emitted on reserve withdraw
   * @param pool the address of the ERC20 token of the pool
   * @param amount the amount to withdraw
   * @param withdrawer the address of withdrawer
   */
  event ReserveWithdrawn(address indexed pool, uint256 amount, address withdrawer);

  /**
   * @dev emitted on update reserve percent
   * @param previousReservePercent the previous pool's reserve percent
   * @param newReservePercent the updated pool's reserve percent
   */
  event ReservePercentUpdated(uint256 previousReservePercent, uint256 newReservePercent);

  /**
   * @dev the struct for storing the user's state separately on each pool
   */
  struct UserPoolData {
    // the user set to used this pool as collateral for borrowing
    bool disableUseAsCollateral;
    // borrow shares of the user of this pool. If user didn't borrow this pool then shere will be 0
    uint256 borrowShares;
    // latest alpha multiplier (borrow reward multiplier) of the user of this pool. Using to calculate current borrow reward.
    uint256 latestAlphaMultiplier;
  }

  /**
   * @dev the struct for storing the pool's state separately on each ERC20 token
   */
  struct Pool {
    // pool status
    PoolStatus status;
    // al token of the pool
    AlToken alToken;
    // pool configuration contract
    IPoolConfiguration poolConfig;
    // total borrow amount on this pool
    uint256 totalBorrows;
    // total share on this pool
    uint256 totalBorrowShares;
    // reserve amount on this pool
    uint256 poolReserves;
    // last update timestamp of this pool
    uint256 lastUpdateTimestamp;
    // total alpha token reward on this pool
    uint256 totalAlphaTokenReward;
    // alpha reward multiplier of each borrow share
    uint256 alphaMultiplier;
  }

  /**
   * @dev the mapping from the ERC20 token to the pool struct of that ERC20 token
   * token address => pool
   */
  mapping(address => Pool) public pools;

  /**
   * @dev the mapping from user address to the ERC20 token to the user data of
   * that ERC20 token's pool
   * user address => token address => user pool data
   */
  mapping(address => mapping(address => UserPoolData)) public userPoolData;

  /**
   * @dev list of all tokens on the lending pool contract.
   */
  ERC20[] public tokenList;

  /**
   * @dev price oracle of the lending pool contract.
   */
  IPriceOracle priceOracle;

  /**
   * @dev alpha token address contract.
   */
  IAlphaDistributor public override distributor;

  /**
   * @dev AltokenDeployer address
   */
  AlTokenDeployer public alTokenDeployer;
  /**
   * @dev VestingAlpha address
   */
  IVestingAlpha public override vestingAlpha;
  // max purchase percent of each liquidation
  // max purchase shares is 50% of user borrow shares
  uint256 public constant CLOSE_FACTOR = 0.5 * 1e18;
  uint256 public constant EQUILIBRIUM = 0.5 * 1e18;
  uint256 public constant MAX_UTILIZATION_RATE = 1 * 1e18;
  uint256 public reservePercent = 0.05 * 1e18;

  constructor(AlTokenDeployer _alTokenDeployer) public {
    alTokenDeployer = _alTokenDeployer;
  }

  /**
   * @dev update accumulated pool's borrow interest from last update timestamp to now then add to total borrows of that pool.
   * any function that use this modifier will update pool's total borrows before starting the function.
   * @param  _token the ERC20 token of the pool that will update accumulated borrow interest to total borrows
   */
  modifier updatePoolWithInterestsAndTimestamp(ERC20 _token) {
    Pool storage pool = pools[address(_token)];
    uint256 borrowInterestRate = pool.poolConfig.calculateInterestRate(
      pool.totalBorrows,
      getTotalLiquidity(_token)
    );
    uint256 cumulativeBorrowInterest = calculateLinearInterest(
      borrowInterestRate,
      pool.lastUpdateTimestamp,
      block.timestamp
    );

    // update pool
    uint256 previousTotalBorrows = pool.totalBorrows;
    pool.totalBorrows = cumulativeBorrowInterest.wadMul(pool.totalBorrows);
    pool.poolReserves = pool.poolReserves.add(
      pool.totalBorrows.sub(previousTotalBorrows).wadMul(reservePercent)
    );
    pool.lastUpdateTimestamp = block.timestamp;
    emit PoolInterestUpdated(address(_token), cumulativeBorrowInterest, pool.totalBorrows);
    _;
  }

  /**
   * @dev update Alpha reward by call poke on distribution contract.
   */
  modifier updateAlphaReward() {
    if (address(distributor) != address(0)) {
      distributor.poke();
    }
    _;
  }

  /**
   * @dev initialize the ERC20 token pool. only owner can initialize the pool.
   * @param _token the ERC20 token of the pool
   * @param _poolConfig the configuration contract of the pool
   */
  function initPool(ERC20 _token, IPoolConfiguration _poolConfig) external onlyOwner {
    for (uint256 i = 0; i < tokenList.length; i++) {
      require(tokenList[i] != _token, "this pool already exists on lending pool");
    }
    string memory alTokenSymbol = string(abi.encodePacked("al", _token.symbol()));
    string memory alTokenName = string(abi.encodePacked("Al", _token.symbol()));
    AlToken alToken = alTokenDeployer.createNewAlToken(alTokenName, alTokenSymbol, _token);
    Pool memory pool = Pool(
      PoolStatus.INACTIVE,
      alToken,
      _poolConfig,
      0,
      0,
      0,
      block.timestamp,
      0,
      0
    );
    pools[address(_token)] = pool;
    tokenList.push(_token);
    emit PoolInitialized(address(_token), address(alToken), address(_poolConfig));
  }

  /**
   * @dev set pool configuration contract of the pool. only owner can set the pool configuration.
   * @param _token the ERC20 token of the pool that will set the configuration
   * @param _poolConfig the interface of the pool's configuration contract
   */
  function setPoolConfig(ERC20 _token, IPoolConfiguration _poolConfig) external onlyOwner {
    Pool storage pool = pools[address(_token)];
    require(
      address(pool.alToken) != address(0),
      "pool isn't initialized, can't set the pool config"
    );
    pool.poolConfig = _poolConfig;
    emit PoolConfigUpdated(address(_token), address(_poolConfig));
  }

  /**
   * @dev set the status of the lending pool. only owner can set the pool's status
   * @param _token the ERC20 token of the pool
   * @param _status the status of the pool
   */
  function setPoolStatus(ERC20 _token, PoolStatus _status) external onlyOwner {
    Pool storage pool = pools[address(_token)];
    pool.status = _status;
  }

  /**
   * @dev set user uses the ERC20 token as collateral flag
   * @param _token the ERC20 token of the pool
   * @param _useAsCollateral the boolean that represent user use the ERC20 token on the pool as collateral or not
   */
  function setUserUseAsCollateral(ERC20 _token, bool _useAsCollateral) external {
    UserPoolData storage userData = userPoolData[msg.sender][address(_token)];
    userData.disableUseAsCollateral = !_useAsCollateral;
    // only disable as collateral need to check the account health
    if (!_useAsCollateral) {
      require(isAccountHealthy(msg.sender), "can't set use as collateral, account isn't healthy.");
    }
  }

  /**
   * @dev set price oracle of the lending pool. only owner can set the price oracle.
   * @param _oracle the price oracle which will get asset price to the lending pool contract
   */
  function setPriceOracle(IPriceOracle _oracle) external onlyOwner {
    priceOracle = _oracle;
    emit PoolPriceOracleUpdated(address(_oracle));
  }

  /**
   * @dev get the pool of the ERC20 token
   * @param _token the ERC20 token of the pool
   * @return status - the pool's status, alTokenAddress - the pool's alToken, poolConfigAddress - the pool's configuration contract,
   * totalBorrows - the pool's total borrows, totalBorrowShares - the pool's total borrow shares, totalLiquidity - the pool's total liquidity,
   * totalAvailableLiquidity - the pool's total available liquidity, lastUpdateTimestamp - the pool's last update timestamp
   */
  function getPool(ERC20 _token)
    external
    view
    returns (
      PoolStatus status,
      address alTokenAddress,
      address poolConfigAddress,
      uint256 totalBorrows,
      uint256 totalBorrowShares,
      uint256 totalLiquidity,
      uint256 totalAvailableLiquidity,
      uint256 lastUpdateTimestamp
    )
  {
    Pool storage pool = pools[address(_token)];
    alTokenAddress = address(pool.alToken);
    poolConfigAddress = address(pool.poolConfig);
    totalBorrows = pool.totalBorrows;
    totalBorrowShares = pool.totalBorrowShares;
    totalLiquidity = getTotalLiquidity(_token);
    totalAvailableLiquidity = getTotalAvailableLiquidity(_token);
    lastUpdateTimestamp = pool.lastUpdateTimestamp;
    status = pool.status;
  }

  /**
   * @dev get user data of the ERC20 token pool
   * @param _user the address of user that need to get the data
   * @param _token the ERC20 token of the pool that need to get the data of the user
   * @return compoundedLiquidityBalance - the compounded liquidity balance of this user in this ERC20 token pool,
   * compoundedBorrowBalance - the compounded borrow balance of this user in this ERC20 pool,
   * userUsePoolAsCollateral - the boolean flag that the user
   * uses the liquidity in this ERC20 token pool as collateral or not
   */
  function getUserPoolData(address _user, ERC20 _token)
    public
    view
    returns (
      uint256 compoundedLiquidityBalance,
      uint256 compoundedBorrowBalance,
      bool userUsePoolAsCollateral
    )
  {
    compoundedLiquidityBalance = getUserCompoundedLiquidityBalance(_user, _token);
    compoundedBorrowBalance = getUserCompoundedBorrowBalance(_user, _token);
    userUsePoolAsCollateral = !userPoolData[_user][address(_token)].disableUseAsCollateral;
  }

  /**
   * @dev calculate the interest rate which is the part of the annual interest rate on the elapsed time
   * @param _rate an annual interest rate express in WAD
   * @param _fromTimestamp the start timestamp to calculate interest
   * @param _toTimestamp the end timestamp to calculate interest
   * @return the interest rate in between the start timestamp to the end timestamp
   */
  function calculateLinearInterest(
    uint256 _rate,
    uint256 _fromTimestamp,
    uint256 _toTimestamp
  ) internal pure returns (uint256) {
    return
      _rate.wadMul(_toTimestamp.sub(_fromTimestamp)).wadDiv(SECONDS_PER_YEAR).add(WadMath.wad());
  }

  /**
   * @dev get user's compounded borrow balance of the user in the ERC20 token pool
   * @param _user the address of the user
   * @param _token the ERC20 token of the pool that will get the compounded borrow balance
   * @return the compounded borrow balance of the user on the ERC20 token pool
   */
  function getUserCompoundedBorrowBalance(address _user, ERC20 _token)
    public
    view
    returns (uint256)
  {
    uint256 userBorrowShares = userPoolData[_user][address(_token)].borrowShares;
    return calculateRoundUpBorrowAmount(_token, userBorrowShares);
  }

  /**
   * @dev get user's compounded liquidity balance of the user in the ERC20 token pool
   * @param _user the account address of the user
   * @param _token the ERC20 token of the pool that will get the compounded liquidity balance
   * @return the compounded liquidity balance of the user on the ERC20 token pool
   */
  function getUserCompoundedLiquidityBalance(address _user, ERC20 _token)
    public
    view
    returns (uint256)
  {
    Pool storage pool = pools[address(_token)];
    uint256 userLiquidityShares = pool.alToken.balanceOf(_user);
    return calculateRoundDownLiquidityAmount(_token, userLiquidityShares);
  }

  /**
   * @dev get total available liquidity in the ERC20 token pool
   * @param _token the ERC20 token of the pool
   * @return the balance of the ERC20 token in the pool
   */
  function getTotalAvailableLiquidity(ERC20 _token) public view returns (uint256) {
    return _token.balanceOf(address(this));
  }

  /**
   * @dev get total liquidity of the ERC20 token pool
   * @param _token the ERC20 token of the pool
   * @return the total liquidity on the lending pool which is the sum of total borrows and available liquidity
   */
  function getTotalLiquidity(ERC20 _token) public view returns (uint256) {
    Pool storage pool = pools[address(_token)];
    return
      pool.totalBorrows.add(getTotalAvailableLiquidity(_token)).sub(
        pools[address(_token)].poolReserves
      );
  }

  /**
   * @dev calculate liquidity share amount (round-down)
   * @param _token the ERC20 token of the pool
   * @param _amount the amount of liquidity to calculate the liquidity shares
   * @return the amount of liquidity shares which is calculated from the below formula
   * liquidity shares = (_amount * total liquidity shares) / total liquidity
   * if the calculated liquidity shares = 2.9 then liquidity shares will be 2
   */
  function calculateRoundDownLiquidityShareAmount(ERC20 _token, uint256 _amount)
    internal
    view
    returns (uint256)
  {
    Pool storage pool = pools[address(_token)];
    uint256 totalLiquidity = getTotalLiquidity(_token);
    uint256 totalLiquidityShares = pool.alToken.totalSupply();
    if (totalLiquidity == 0 && totalLiquidityShares == 0) {
      return _amount;
    }
    return _amount.mul(totalLiquidityShares).div(totalLiquidity);
  }

  /**
   * @dev calculate borrow share amount (round-up)
   * @param _token the ERC20 token of the pool
   * @param _amount the amount of borrow to calculate the borrow shares
   * @return the borrow amount which is calculated from the below formula
   * borrow shares = ((amount * total borrow shares) + (total borrows -  1)) / total borrow
   * if the calculated borrow shares = 10.1 then the borrow shares = 11
   */
  function calculateRoundUpBorrowShareAmount(ERC20 _token, uint256 _amount)
    internal
    view
    returns (uint256)
  {
    Pool storage pool = pools[address(_token)];
    // borrow share amount of the first borrowing is equal to amount
    if (pool.totalBorrows == 0 || pool.totalBorrowShares == 0) {
      return _amount;
    }
    return
      (_amount.mul(pool.totalBorrowShares)).add(pool.totalBorrows.sub(1)).div(pool.totalBorrows);
  }

  /**
   * @dev calculate borrow share amount (round-down)
   * @param _token the ERC20 token of the pool
   * @param _amount the amount of borrow to calculate the borrow shares
   * @return the borrow amount which is calculated from the below formula
   * borrow shares = (_amount * total borrow shares) / total borrows
   * if the calculated borrow shares = 10.9 then the borrow shares = 10
   */
  function calculateRoundDownBorrowShareAmount(ERC20 _token, uint256 _amount)
    internal
    view
    returns (uint256)
  {
    Pool storage pool = pools[address(_token)];
    if (pool.totalBorrowShares == 0) {
      return 0;
    }
    return _amount.mul(pool.totalBorrowShares).div(pool.totalBorrows);
  }

  /**
   * @dev calculate liquidity share amount (round-up)
   * @param _token the ERC20 token of the pool
   * @param _amount the amount of liquidity to calculate the liquidity shares
   * @return the liquidity shares which is calculated from the below formula
   * liquidity shares = ((amount * total liquidity shares) + (total liquidity - 1)) / total liquidity shares
   * if the calculated liquidity shares = 10.1 then the liquidity shares = 11
   */
  function calculateRoundUpLiquidityShareAmount(ERC20 _token, uint256 _amount)
    internal
    view
    returns (uint256)
  {
    Pool storage pool = pools[address(_token)];
    uint256 poolTotalLiquidityShares = pool.alToken.totalSupply();
    uint256 poolTotalLiquidity = getTotalLiquidity(_token);
    // liquidity share amount of the first depositing is equal to amount
    if (poolTotalLiquidity == 0 || poolTotalLiquidityShares == 0) {
      return _amount;
    }
    return
      (_amount.mul(poolTotalLiquidityShares).add(poolTotalLiquidity.sub(1))).div(
        poolTotalLiquidity
      );
  }

  /**
   * @dev calculate liquidity amount (round-down)
   * @param _token the ERC20 token of the pool
   * @param _shareAmount the liquidity shares to calculate the amount of liquidity
   * @return the amount of liquidity which is calculated from the below formula
   * liquidity amount = (_shareAmount * total liquidity) / total liquidity shares
   * if the calculated liquidity amount = 10.9 then the liquidity amount = 10
   */
  function calculateRoundDownLiquidityAmount(ERC20 _token, uint256 _shareAmount)
    internal
    view
    returns (uint256)
  {
    Pool storage pool = pools[address(_token)];
    uint256 poolTotalLiquidityShares = pool.alToken.totalSupply();
    if (poolTotalLiquidityShares == 0) {
      return 0;
    }
    return _shareAmount.mul(getTotalLiquidity(_token)).div(poolTotalLiquidityShares);
  }

  /**
   * @dev calculate borrow amount (round-up)
   * @param _token the ERC20 token of the pool
   * @param _shareAmount the borrow shares to calculate the amount of borrow
   * @return the amount of borrowing which is calculated from the below formula
   * borrowing amount = ((share amount * total borrows) + (total borrow shares - 1)) / total borrow shares
   * if the calculated borrowing amount = 10.1 then the borrowing amount = 11
   */
  function calculateRoundUpBorrowAmount(ERC20 _token, uint256 _shareAmount)
    internal
    view
    returns (uint256)
  {
    Pool storage pool = pools[address(_token)];
    if (pool.totalBorrows == 0 || pool.totalBorrowShares == 0) {
      return _shareAmount;
    }
    return
      _shareAmount.mul(pool.totalBorrows).add(pool.totalBorrowShares.sub(1)).div(
        pool.totalBorrowShares
      );
  }

  /**
   * @dev check is the user account is still healthy
   * Traverse a token list to visit all ERC20 token pools then accumulate 3 balance values of the user:
   * -----------------------------
   * 1. user's total liquidity balance. Accumulate the user's liquidity balance of all ERC20 token pools
   * 2. user's total borrow balance. Accumulate the user's borrow balance of all ERC20 token pools
   * 3. user's total collateral balance. each ERC20 token has the different max loan-to-value (collateral percent) or the percent of
   * liquidity that can actually use as collateral for the borrowing.
   * e.g. if B token has 75% collateral percent means the collateral balance is 75 if the user's has 100 B token balance
   * -----------------------------
   * the account is still healthy if total borrow value is less than total collateral value. This means the user's collateral
   * still cover the user's loan. In case of total borrow value is more than total collateral value then user's account is not healthy.
   * @param _user the address of the user that will check the account health status
   * @return the boolean that represent the account health status. Returns true if account is still healthy, false if account is not healthy.
   */
  function isAccountHealthy(address _user) public override view returns (bool) {
    (, uint256 totalCollateralBalanceBase, uint256 totalBorrowBalanceBase) = getUserAccount(_user);

    return totalBorrowBalanceBase <= totalCollateralBalanceBase;
  }

  /**
   * @dev get user account details
   * @param _user the address of the user to get the account details
   * return totalLiquidityBalanceBase - the value of user's total liquidity,
   * totalCollateralBalanceBase - the value of user's total collateral,
   * totalBorrowBalanceBase - the value of user's total borrow
   */
  function getUserAccount(address _user)
    public
    view
    returns (
      uint256 totalLiquidityBalanceBase,
      uint256 totalCollateralBalanceBase,
      uint256 totalBorrowBalanceBase
    )
  {
    for (uint256 i = 0; i < tokenList.length; i++) {
      ERC20 _token = tokenList[i];
      Pool storage pool = pools[address(_token)];

      // get user pool data
      (
        uint256 compoundedLiquidityBalance,
        uint256 compoundedBorrowBalance,
        bool userUsePoolAsCollateral
      ) = getUserPoolData(_user, _token);

      if (compoundedLiquidityBalance != 0 || compoundedBorrowBalance != 0) {
        uint256 collateralPercent = pool.poolConfig.getCollateralPercent();
        uint256 poolPricePerUnit = priceOracle.getAssetPrice(address(_token));
        require(poolPricePerUnit > 0, "token price isn't correct");

        uint256 liquidityBalanceBase = poolPricePerUnit.wadMul(compoundedLiquidityBalance);
        totalLiquidityBalanceBase = totalLiquidityBalanceBase.add(liquidityBalanceBase);
        // this pool can use as collateral when collateralPercent more than 0.
        if (collateralPercent > 0 && userUsePoolAsCollateral) {
          totalCollateralBalanceBase = totalCollateralBalanceBase.add(
            liquidityBalanceBase.wadMul(collateralPercent)
          );
        }
        totalBorrowBalanceBase = totalBorrowBalanceBase.add(
          poolPricePerUnit.wadMul(compoundedBorrowBalance)
        );
      }
    }
  }

  function totalBorrowInUSD(ERC20 _token) public view returns (uint256) {
    require(address(priceOracle) != address(0), "price oracle isn't initialized");
    uint256 tokenPricePerUnit = priceOracle.getAssetPrice(address(_token));
    require(tokenPricePerUnit > 0, "token price isn't correct");
    return tokenPricePerUnit.mul(pools[address(_token)].totalBorrows);
  }

  /**
   * @dev deposit the ERC20 token to the pool
   * @param _token the ERC20 token of the pool that user want to deposit
   * @param _amount the deposit amount
   * User can call this function to deposit their ERC20 token to the pool. user will receive the alToken of that ERC20 token
   * which represent the liquidity shares of the user. Providing the liquidity will receive an interest from the the borrower as an incentive.
   * e.g. Alice deposits 10 Hello tokens to the pool.
   * if 1 Hello token shares equals to 2 Hello tokens then Alice will have 5 Hello token shares from 10 Hello tokens depositing.
   * User will receive the liquidity shares in the form of alToken so Alice will have 5 alHello on her wallet
   * for representing her shares.
   */
  function deposit(ERC20 _token, uint256 _amount)
    external
    nonReentrant
    updatePoolWithInterestsAndTimestamp(_token)
    updateAlphaReward
  {
    Pool storage pool = pools[address(_token)];
    require(pool.status == PoolStatus.ACTIVE, "can't deposit to this pool");
    require(_amount > 0, "deposit amount should more than 0");

    // 1. calculate liquidity share amount
    uint256 shareAmount = calculateRoundDownLiquidityShareAmount(_token, _amount);

    // 2. mint alToken to user equal to liquidity share amount
    pool.alToken.mint(msg.sender, shareAmount);

    // 3. transfer user deposit liquidity to the pool
    _token.safeTransferFrom(msg.sender, address(this), _amount);

    emit Deposit(address(_token), msg.sender, shareAmount, _amount);
  }

  /**
   * @dev borrow the ERC20 token from the pool
   * @param _token the ERC20 token of the pool that user want to borrow
   * @param _amount the borrow amount
   * User can call this function to borrow the ERC20 token from the pool. This function will
   * convert the borrow amount to the borrow shares then accumulate borrow shares of this user
   * of this ERC20 pool then set to user data on that pool state.
   * e.g. Bob borrows 10 Hello tokens from the Hello token pool.
   * if 1 borrow shares of Hello token equals to 5 Hello tokens then the lending contract will
   * set Bob's borrow shares state with 2 borrow shares. Bob will receive 10 Hello tokens.
   */
  function borrow(ERC20 _token, uint256 _amount)
    external
    nonReentrant
    updatePoolWithInterestsAndTimestamp(_token)
    updateAlphaReward
  {
    Pool storage pool = pools[address(_token)];
    UserPoolData storage userData = userPoolData[msg.sender][address(_token)];
    require(pool.status == PoolStatus.ACTIVE, "can't borrow this pool");
    require(_amount > 0, "borrow amount should more than 0");
    require(
      _amount <= getTotalAvailableLiquidity(_token),
      "amount is more than available liquidity on pool"
    );

    // 0. Claim alpha token from latest borrow
    claimCurrentAlphaReward(_token, msg.sender);

    // 1. calculate borrow share amount
    uint256 borrowShare = calculateRoundUpBorrowShareAmount(_token, _amount);

    // 2. update pool state
    pool.totalBorrows = pool.totalBorrows.add(_amount);
    pool.totalBorrowShares = pool.totalBorrowShares.add(borrowShare);

    // 3. update user state
    userData.borrowShares = userData.borrowShares.add(borrowShare);

    // 4. transfer borrowed token from pool to user
    _token.safeTransfer(msg.sender, _amount);

    // 5. check account health. this transaction will revert if the account of this user is not healthy
    require(isAccountHealthy(msg.sender), "account is not healthy. can't borrow");
    emit Borrow(address(_token), msg.sender, borrowShare, _amount);
  }

  /**
   * @dev repay the ERC20 token to the pool equal to repay amount
   * @param _token the ERC20 token of the pool that user want to repay
   * @param _amount the repay amount
   * User can call this function to repay the ERC20 token to the pool. For user's convenience,
   * this function will convert repay amount to repay shares then do the repay.
   */
  function repayByAmount(ERC20 _token, uint256 _amount)
    external
    nonReentrant
    updatePoolWithInterestsAndTimestamp(_token)
    updateAlphaReward
  {
    // calculate round down borrow share
    uint256 repayShare = calculateRoundDownBorrowShareAmount(_token, _amount);
    repayInternal(_token, repayShare);
  }

  /**
   * @dev repay the ERC20 token to the pool equal to repay shares
   * @param _token the ERC20 token of the pool that user want to repay
   * @param _share the amount of borrow shares thet user want to repay
   * User can call this function to repay the ERC20 token to the pool.
   * This function will do the repay equal to repay shares
   */
  function repayByShare(ERC20 _token, uint256 _share)
    external
    nonReentrant
    updatePoolWithInterestsAndTimestamp(_token)
    updateAlphaReward
  {
    repayInternal(_token, _share);
  }

  /**
   * @dev repay the ERC20 token to the pool equal to repay shares
   * @param _token the ERC20 token of the pool that user want to repay
   * @param _share the amount of borrow shares thet user want to repay
   * Internal function that do the repay. If Alice want to repay 10 borrow shares then the repay shares is 10.
   * this function will repay the ERC20 token of Alice equal to repay shares value to the pool.
   * If 1 repay shares equal to 2 Hello tokens then Alice will repay 20 Hello tokens to the pool. the Alice's
   * borrow shares will be decreased.
   */
  function repayInternal(ERC20 _token, uint256 _share) internal {
    Pool storage pool = pools[address(_token)];
    UserPoolData storage userData = userPoolData[msg.sender][address(_token)];
    require(
      pool.status == PoolStatus.ACTIVE || pool.status == PoolStatus.CLOSED,
      "can't repay to this pool"
    );
    uint256 paybackShares = _share;
    if (paybackShares > userData.borrowShares) {
      paybackShares = userData.borrowShares;
    }

    // 0. Claim alpha token from latest borrow
    claimCurrentAlphaReward(_token, msg.sender);

    // 1. calculate round up payback token
    uint256 paybackAmount = calculateRoundUpBorrowAmount(_token, paybackShares);

    // 2. update pool state
    pool.totalBorrows = pool.totalBorrows.sub(paybackAmount);
    pool.totalBorrowShares = pool.totalBorrowShares.sub(paybackShares);

    // 3. update user state
    userData.borrowShares = userData.borrowShares.sub(paybackShares);

    // 4. transfer payback tokens to the pool
    _token.safeTransferFrom(msg.sender, address(this), paybackAmount);
    emit Repay(address(_token), msg.sender, paybackShares, paybackAmount);
  }

  /**
   * @dev withdraw the ERC20 token from the pool
   * @param _token the ERC20 token of the pool that user want to withdraw
   * @param _share the alToken amount that user want to withdraw
   * When user withdraw their liquidity shares or alToken, they will receive the ERC20 token from the pool
   * equal to the alHello value.
   * e.g. Bob want to withdraw 10 alHello. If 1 alHello equal to 10 Hello tokens then Bob will receive
   * 100 Hello tokens after withdraw. Bob's alHello will be burned.
   * Note: Bob cannot withdraw his alHello if his account is not healthy which means he uses all of his liquidity as
   * collateral to cover his loan so he cannot withdraw or transfer his alHello.
   */
  function withdraw(ERC20 _token, uint256 _share)
    external
    nonReentrant
    updatePoolWithInterestsAndTimestamp(_token)
    updateAlphaReward
  {
    Pool storage pool = pools[address(_token)];
    uint256 alBalance = pool.alToken.balanceOf(msg.sender);
    require(
      pool.status == PoolStatus.ACTIVE || pool.status == PoolStatus.CLOSED,
      "can't withdraw this pool"
    );
    uint256 withdrawShares = _share;
    if (withdrawShares > alBalance) {
      withdrawShares = alBalance;
    }

    // 1. calculate liquidity amount from shares
    uint256 withdrawAmount = calculateRoundDownLiquidityAmount(_token, withdrawShares);

    // 2. burn al tokens of user equal to shares
    pool.alToken.burn(msg.sender, withdrawShares);

    // 3. transfer ERC20 tokens to user account
    _token.transfer(msg.sender, withdrawAmount);

    // 4. check account health. this transaction will revert if the account of this user is not healthy
    require(isAccountHealthy(msg.sender), "account is not healthy. can't withdraw");
    emit Withdraw(address(_token), msg.sender, withdrawShares, withdrawAmount);
  }

  /**
   * @dev liquidate the unhealthy user account
   * @param _user the address of the user that liquidator want to liquidate
   * @param _token the token that liquidator whan to liquidate
   * @param _liquidateShares the amount of token shares that liquidator want to liquidate
   * @param _collateral the ERC20 token of the pool that liquidator will receive as a reward
   * If the user's account health is not healthy, anothor user can become to the liquidator to liquidate
   * the user account then got the collateral as a reward.
   */
  function liquidate(
    address _user,
    ERC20 _token,
    uint256 _liquidateShares,
    ERC20 _collateral
  )
    external
    nonReentrant
    updatePoolWithInterestsAndTimestamp(_token)
    updatePoolWithInterestsAndTimestamp(_collateral)
    updateAlphaReward
  {
    liquidateInternal(_user, _token, _liquidateShares, _collateral);
  }

  /**
   * @dev liquidate the unhealthy user account (internal)
   * @param _user the address of the user that liquidator want to liquidate
   * @param _token the token that liquidator whan to liquidate
   * @param _liquidateShares the amount of token shares that liquidator want to liquidate
   * @param _collateral the ERC20 token of the pool that liquidator will receive as a reward
   * e.g. Alice account is not healthy. Bob saw Alice account then want to liquidate 10 Hello borrow shares of Alice account
   * and want to get the Seeyou tokens as the collateral. The steps that will happen is below:
   * 1. Bob calls the liquidate function with _user is Alice address, _token is Hello token,
   * _liquidateShare is 10, _collateral is Seeyou token to liquidate Alice account.
   * 2. Contract check if Alice account is in an unhealthy state or not. If Alice account is
   * still healthy, Bob cannot liquidate this account then this transaction will be revert.
   * 3. Contract check if the collateral that Bob has requested enable for the liquidation reward both on
   * pool enabling and Alice enabling.
   * 4. Bob can liquidate Alice account if Alice has been borrowing Hello tokens from the pool.
   * 5. Bob can liquidate from 0 to the max liquidate shares which equal to 50% of Alice's Hello borrow share.
   * 6. Contract calculates the amount of collateral that Bob will receive as the rewards to convert to
   * the amount of Seeyou shares. Seeyou shares is the alSeeyou token.
   * 7. Bob pays Hello tokens equal to 10 Hello shares. If 1 Hello shares equal to 10 Hello tokens then Bob will
   * pay 100 Hello token to the pool
   * 8. The borrowing shares of the Hello token on Alice account will be decreased. The alSeeyou of Alice will be burned.
   * 9. Bob will get 105 alSeeyou tokens.
   * 10. Bob can withdraw the alHello tokens later to get the Hello tokens from the pool.
   * Note: Hello and Seeyou are the imaginary ERC20 token.
   */
  function liquidateInternal(
    address _user,
    ERC20 _token,
    uint256 _liquidateShares,
    ERC20 _collateral
  ) internal {
    Pool storage pool = pools[address(_token)];
    Pool storage collateralPool = pools[address(_collateral)];
    UserPoolData storage userCollateralData = userPoolData[_user][address(_collateral)];
    UserPoolData storage userTokenData = userPoolData[_user][address(_token)];
    require(
      pool.status == PoolStatus.ACTIVE || pool.status == PoolStatus.CLOSED,
      "can't liquidate this pool"
    );

    // 0. Claim alpha token from latest user borrow
    claimCurrentAlphaReward(_token, _user);

    // 1. check account health of user to make sure that liquidator can liquidate this account
    require(!isAccountHealthy(_user), "user's account is healthy. can't liquidate this account");

    // 2. check if the user enables collateral
    require(
      !userCollateralData.disableUseAsCollateral,
      "user didn't enable the requested collateral"
    );

    // 3. check if the token pool enable to use as collateral
    require(
      collateralPool.poolConfig.getCollateralPercent() > 0,
      "this pool isn't used as collateral"
    );

    // 4. check if the user has borrowed tokens that liquidator want to liquidate
    require(userTokenData.borrowShares > 0, "user didn't borrow this token");

    // 5. calculate liquidate amount and shares
    uint256 maxPurchaseShares = userTokenData.borrowShares.wadMul(CLOSE_FACTOR);
    uint256 liquidateShares = _liquidateShares;
    if (liquidateShares > maxPurchaseShares) {
      liquidateShares = maxPurchaseShares;
    }
    uint256 liquidateAmount = calculateRoundUpBorrowAmount(_token, liquidateShares);

    // 6. calculate collateral amount and shares
    uint256 collateralAmount = calculateCollateralAmount(_token, liquidateAmount, _collateral);
    uint256 collateralShares = calculateRoundUpLiquidityShareAmount(_collateral, collateralAmount);

    // 7. transfer liquidate amount to the pool
    _token.safeTransferFrom(msg.sender, address(this), liquidateAmount);

    // 8. burn al token of user equal to collateral shares
    require(
      collateralPool.alToken.balanceOf(_user) > collateralShares,
      "user collateral isn't enough"
    );
    collateralPool.alToken.burn(_user, collateralShares);

    // 9. mint al token equal to collateral shares to liquidator
    collateralPool.alToken.mint(msg.sender, collateralShares);

    // 10. update pool state
    pool.totalBorrows = pool.totalBorrows.sub(liquidateAmount);
    pool.totalBorrowShares = pool.totalBorrowShares.sub(liquidateShares);

    // 11. update user state
    userTokenData.borrowShares = userTokenData.borrowShares.sub(liquidateShares);

    emit Liquidate(
      _user,
      address(_token),
      address(_collateral),
      liquidateAmount,
      liquidateShares,
      collateralAmount,
      collateralShares,
      msg.sender
    );
  }

  /**
   * @dev calculate collateral amount that the liquidator will receive after the liquidation
   * @param _token the token that liquidator whan to liquidate
   * @param _liquidateAmount the amount of token that liquidator want to liquidate
   * @param _collateral the ERC20 token of the pool that liquidator will receive as a reward
   * @return the collateral amount of the liquidation
   * This function will be call on liquidate function to calculate the collateral amount that
   * liquidator will get after the liquidation. Liquidation bonus is expressed in percent. the collateral amount
   * depends on each pool. If the Hello pool has liquidation bonus equal to 105% then the collateral value is
   * more than the value of liquidated tokens around 5%. the formula is below:
   * collateral amount = (token price * liquidate amount * liquidation bonus percent) / collateral price
   */
  function calculateCollateralAmount(
    ERC20 _token,
    uint256 _liquidateAmount,
    ERC20 _collateral
  ) internal view returns (uint256) {
    require(address(priceOracle) != address(0), "price oracle isn't initialized");
    uint256 tokenPricePerUnit = priceOracle.getAssetPrice(address(_token));
    require(tokenPricePerUnit > 0, "liquidated token price isn't correct");
    uint256 collateralPricePerUnit = priceOracle.getAssetPrice(address(_collateral));
    require(collateralPricePerUnit > 0, "collateral price isn't correct");
    uint256 liquidationBonus = pools[address(_token)].poolConfig.getLiquidationBonusPercent();
    return (
      tokenPricePerUnit.mul(_liquidateAmount).wadMul(liquidationBonus).div(collateralPricePerUnit)
    );
  }

  /**
   * @dev set reserve percent for admin
   * @param _reservePercent the percent of pool reserve
   */
  function setReservePercent(uint256 _reservePercent) external onlyOwner {
    uint256 previousReservePercent = reservePercent;
    reservePercent = _reservePercent;
    emit ReservePercentUpdated(previousReservePercent, reservePercent);
  }

  /**
   * @dev withdraw function for admin to get the reserves
   * @param _token the ERC20 token of the pool to withdraw
   * @param _amount amount to withdraw
   */
  function withdrawReserve(ERC20 _token, uint256 _amount)
    external
    nonReentrant
    updatePoolWithInterestsAndTimestamp(_token)
    onlyOwner
  {
    Pool storage pool = pools[address(_token)];
    uint256 poolBalance = _token.balanceOf(address(this));
    require(_amount <= poolBalance, "pool balance insufficient");
    // admin can't withdraw more than pool's reserve
    require(_amount <= pool.poolReserves, "amount is more than pool reserves");
    _token.safeTransfer(msg.sender, _amount);
    pool.poolReserves = pool.poolReserves.sub(_amount);
    emit ReserveWithdrawn(address(_token), _amount, msg.sender);
  }

  // ================== 💸💸💸 Distribute AlphaToken 💸💸💸 ========================

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
   * @dev implement function of IAlphaReceiver interface to
   * receive Alpha token rewards from the distributor
   * @param _amount the amount of Alpha token to receive
   */
  function receiveAlpha(uint256 _amount) external override {
    require(msg.sender == address(distributor), "Only distributor can call receive Alpha");
    // Calculate total borrow value.
    uint256[] memory borrows = new uint256[](tokenList.length);
    uint256 totalBorrow = 0;

    for (uint256 i = 0; i < tokenList.length; i++) {
      if (pools[address(tokenList[i])].status == PoolStatus.ACTIVE) {
        borrows[i] = totalBorrowInUSD(tokenList[i]);
        totalBorrow = totalBorrow.add(borrows[i]);
      }
    }
    // This contract should not receive alpha token if no borrow value lock in.
    if (totalBorrow == 0) {
      return;
    }
    distributor.alphaToken().transferFrom(msg.sender, address(this), _amount);
    for (uint256 i = 0; i < borrows.length; i++) {
      Pool storage pool = pools[address(tokenList[i])];
      if (pool.status == PoolStatus.ACTIVE) {
        uint256 portion = _amount.mul(borrows[i]).div(totalBorrow);
        (uint256 lendersGain, uint256 borrowersGain) = splitReward(tokenList[i], portion);
        // Distribute the Alpha token to the lenders (AlToken holder)
        distributor.alphaToken().approve(address(pool.alToken), lendersGain);
        pool.alToken.receiveAlpha(lendersGain);

        // Distribute the Alpha token to the borrowers
        updateBorrowAlphaReward(pool, borrowersGain);
      }
    }
  }

  /**
   * @dev claim Alpha token rewards from all ERC20 token pools and create receipt for caller
   */
  function claimAlpha() external updateAlphaReward nonReentrant {
    for (uint256 i = 0; i < tokenList.length; i++) {
      Pool storage pool = pools[address(tokenList[i])];

      // claim Alpha rewards as a lender
      pool.alToken.claimCurrentAlphaRewardByOwner(msg.sender);

      // claim Alpha reward as a borrower
      claimCurrentAlphaReward(tokenList[i], msg.sender);
    }
  }

  /**
   * @dev update Alpha rewards for the borrower of the ERC20 pool
   * @param _pool the ERC20 token pool to update the Alpha rewards
   * @param _amount the total amount of the rewards to all borrowers of the pool
   */
  function updateBorrowAlphaReward(Pool storage _pool, uint256 _amount) internal {
    _pool.totalAlphaTokenReward = _pool.totalAlphaTokenReward.add(_amount);
    if (_pool.totalBorrowShares == 0) {
      return;
    }
    _pool.alphaMultiplier = _pool.alphaMultiplier.add(
      _amount.mul(1e12).div(_pool.totalBorrowShares)
    );
  }

  /**
   * @dev split the Alpha rewards between the lenders and borrowers
   * @param _token the ERC20 token pool
   * @param _amount the amount of Alpha token rewards to split
   * @return lendersGain - the rewards's lenders gain
   * borrowersGain - the rewards's borrower gain
   */
  function splitReward(ERC20 _token, uint256 _amount)
    internal
    view
    returns (uint256 lendersGain, uint256 borrowersGain)
  {
    Pool storage pool = pools[address(_token)];
    uint256 utilizationRate = pool.poolConfig.getUtilizationRate(
      pool.totalBorrows,
      getTotalLiquidity(_token)
    );
    uint256 optimal = pool.poolConfig.getOptimalUtilizationRate();
    if (utilizationRate <= optimal) {
      // lenders gain = amount * ((EQUILIBRIUM / OPTIMAL) * utilization rate)
      lendersGain = (optimal == 0)
        ? 0
        : _amount.wadMul(EQUILIBRIUM).wadMul(utilizationRate).wadDiv(optimal);
    } else {
      // lenders gain = amount * ((EQUILIBRIUM * (utilization rate - OPTIMAL)) / (MAX_UTILIZATION_RATE - OPTIMAL)) + EQUILIBRIUM)
      lendersGain = (utilizationRate >= MAX_UTILIZATION_RATE)
        ? _amount
        : _amount.wadMul(
          EQUILIBRIUM
            .wadMul(utilizationRate.sub(optimal))
            .wadDiv(MAX_UTILIZATION_RATE.sub(optimal))
            .add(EQUILIBRIUM)
        );
    }
    // borrowers gain = amount - lenders gain
    borrowersGain = _amount.sub(lendersGain);
  }

  function calculateAlphaReward(ERC20 _token, address _account) public view returns (uint256) {
    Pool storage pool = pools[address(_token)];
    UserPoolData storage userData = userPoolData[_account][address(_token)];
    //               reward start block                                        now
    // Global                |----------------|----------------|----------------|
    // User's latest reward  |----------------|----------------|
    // User's Alpha rewards                                    |----------------|
    // reward = [(Global Alpha multiplier - user's lastest Alpha multiplier) * user's Alpha token] / 1e12
    uint256 pending = pool
      .alphaMultiplier
      .sub(userData.latestAlphaMultiplier)
      .mul(userData.borrowShares)
      .div(1e12);
    return pending < pool.totalAlphaTokenReward ? pending : pool.totalAlphaTokenReward;
  }

  /**
   * @dev claim Alpha tokens rewards
   * @param _token the ERC20 pool
   * @param _account the user account that will claim the Alpha tokens
   */
  function claimCurrentAlphaReward(ERC20 _token, address _account) internal {
    // No op if alpha distributor didn't be set in lending pool.
    if (address(distributor) == address(0)) {
      return;
    }
    Pool storage pool = pools[address(_token)];
    UserPoolData storage userData = userPoolData[_account][address(_token)];
    uint256 reward = calculateAlphaReward(_token, _account);
    pool.totalAlphaTokenReward = pool.totalAlphaTokenReward.sub(reward);
    userData.latestAlphaMultiplier = pool.alphaMultiplier;
    sendAlphaReward(_account, reward);
  }

  /**
   * @dev send Alpha tokens to the recipient
   * @param _recipient the recipient of the Alpha reward
   * @param _amount the Alpha reward amount to send
   */
  function sendAlphaReward(address _recipient, uint256 _amount) internal {
    if (address(vestingAlpha) == address(0)) {
      distributor.alphaToken().transfer(_recipient, _amount);
    } else {
      distributor.alphaToken().approve(address(vestingAlpha), _amount);
      vestingAlpha.accumulateAlphaToUser(_recipient, _amount);
    }
  }
}
