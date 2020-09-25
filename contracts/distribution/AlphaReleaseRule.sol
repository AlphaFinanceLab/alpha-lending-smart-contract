pragma solidity 0.6.11;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../libraries/WadMath.sol";
import "../interfaces/IAlphaReleaseRule.sol";

/**
 * @title Alpha rule contract
 * @notice Implements the distribution of the Alpha token pool.
 * @author Alpha
 **/

contract AlphaReleaseRule is Ownable, IAlphaReleaseRule {
  using SafeMath for uint256;
  using WadMath for uint256;

  // number of block per week
  uint256 public blockPerWeek;
  // the start block of alpha distribution (week0 will start from startBlock + 1 )
  uint256 public startBlock;
  // week => number of token per block
  uint256[] public tokensPerBlock;

  constructor(
    uint256 _startBlock,
    uint256 _blockPerWeek,
    uint256[] memory _tokensPerBlock
  ) public {
    startBlock = _startBlock;
    blockPerWeek = _blockPerWeek;
    for (uint256 i = 0; i < _tokensPerBlock.length; i++) {
      tokensPerBlock.push(_tokensPerBlock[i]);
    }
  }

  /**
   * @dev set the amount of token to distribute per block of that week
   * @param _week the week to set
   * @param _amount the amount of alpha token to distribute on that week
   */
  function setTokenPerBlock(uint256 _week, uint256 _amount) external onlyOwner {
    tokensPerBlock[_week] = _amount;
  }

  /**
   * @dev get the amount of distributed token from _fromBlock + 1 to _toBlock
   * @param _fromBlock calculate from _fromBlock + 1 
   * @param _toBlock calculate to the _toBlock
   */
  function getReleaseAmount(uint256 _fromBlock, uint256 _toBlock)
    external
    override
    view
    returns (uint256)
  {
    uint256 lastBlock = startBlock.add(tokensPerBlock.length.mul(blockPerWeek));
    if (_toBlock <= startBlock || lastBlock <= _fromBlock) {
      return 0;
    }
    uint256 fromBlock = _fromBlock > startBlock ? _fromBlock : startBlock;
    uint256 toBlock = _toBlock < lastBlock ? _toBlock : lastBlock;
    uint256 week = findWeekByBlockNumber(fromBlock);
    uint256 totalAmount = 0;
    while (fromBlock < toBlock) {
      uint256 nextWeekBlock = findNextWeekFirstBlock(fromBlock);
      nextWeekBlock = toBlock < nextWeekBlock ? toBlock : nextWeekBlock;
      totalAmount = totalAmount.add(nextWeekBlock.sub(fromBlock).mul(tokensPerBlock[week]));
      week = week.add(1);
      fromBlock = nextWeekBlock;
    }
    return totalAmount;
  }

  /**
   * @dev find the week of that block (week0 starts from the startBlock + 1)
   * @param _block the block number to find week
   */
  function findWeekByBlockNumber(uint256 _block) public view returns (uint256) {
    require(_block >= startBlock, "the block number must more than or equal start block");
    return _block.sub(startBlock).div(blockPerWeek);
  }

  /**
   * @dev find the next week first block of this block.
   * |--------------------------|      |--------------------------|
   * 10                         20     21                         30
   *                       |--18
   * the next week first block of block#18 is block#20
   * @param _block the block number to find the next week first block
   */
  function findNextWeekFirstBlock(uint256 _block) public view returns (uint256) {
    require(_block >= startBlock, "the block number must more than or equal start block");
    return
      _block.sub(startBlock).div(blockPerWeek).mul(blockPerWeek).add(blockPerWeek).add(startBlock);
  }
}
