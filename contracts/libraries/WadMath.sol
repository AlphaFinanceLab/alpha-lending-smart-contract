pragma solidity 0.6.11;

import "@openzeppelin/contracts/math/SafeMath.sol";

/**
 * @title WadMath library
 * @notice The wad math library.
 * @author Alpha
 **/

library WadMath {
  using SafeMath for uint256;

  /**
   * @dev one WAD is equals to 10^18
   */
  uint256 internal constant WAD = 1e18;

  /**
   * @notice get wad
   */
  function wad() internal pure returns (uint256) {
    return WAD;
  }

  /**
   * @notice a multiply by b in Wad unit
   * @return the result of multiplication
   */
  function wadMul(uint256 a, uint256 b) internal pure returns (uint256) {
    return a.mul(b).div(WAD);
  }

  /**
   * @notice a divided by b in Wad unit
   * @return the result of division
   */
  function wadDiv(uint256 a, uint256 b) internal pure returns (uint256) {
    return a.mul(WAD).div(b);
  }
}
