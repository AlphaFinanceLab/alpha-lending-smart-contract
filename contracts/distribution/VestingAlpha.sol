// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.6.11;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IVestingAlpha.sol";
import "./AlphaToken.sol";

/**
 * @title Alpha vesting contract
 * @notice Implements Alpha vesting contract
 * @author Alpha
 */

contract VestingAlpha is IVestingAlpha, ReentrancyGuard {
  using SafeMath for uint256;

  /**
   * @dev the struct for the receipt
   */
  struct Receipt {
    address recipient;
    uint256 amount;
    uint256 createdAt;
    uint256 claimedAmount;
  }

  /**
   * @dev emitted on accumulate Alpha token
   * @param user the account of user
   * @param amount the amount of Alpha token to accumulate
   */
  event AlphaTokenAccumulated(address indexed user, uint256 amount);

  /**
   * @dev emitted on create receipt
   * @param receiptID the ID of the receipt
   * @param recipient the recipient of the receipt
   * @param amount the amount to withdraw
   */
  event ReceiptCreated(uint256 indexed receiptID, address indexed recipient, uint256 amount);

  /**
   * @dev emitted on claim receipt
   * @param receiptID the ID of the receipt
   * @param amount the amount has been claimed
   */
  event ReceiptClaimed(uint256 indexed receiptID, uint256 amount);

  // alpha token
  AlphaToken public alphaToken;
  // all receipt list of vesting contract
  Receipt[] public receipts;
  // the vesting duration to claim Alpha token
  uint256 public vestingDuration;
  // user => accumulate Alpha
  mapping(address => uint256) public userAccumulatedAlpha;

  constructor(AlphaToken _alphaToken, uint256 _vestingDuration) public {
    alphaToken = _alphaToken;
    vestingDuration = _vestingDuration;
  }

  /**
   * @dev accumulate Alpha token to user
   * @param _user the user account address
   * @param _amount the amount of Alpha token to accumulate
   */
  function accumulateAlphaToUser(address _user, uint256 _amount) external override nonReentrant {
    alphaToken.transferFrom(msg.sender, address(this), _amount);
    userAccumulatedAlpha[_user] = userAccumulatedAlpha[_user].add(_amount);
    emit AlphaTokenAccumulated(_user, _amount);
  }

  /**
   * @dev create receipt for caller
   */
  function createReceipt() external override nonReentrant returns (uint256) {
    uint256 amount = userAccumulatedAlpha[msg.sender];
    require(amount > 0, "User don't have accumulate Alpha to create receipt");
    receipts.push(
      Receipt({recipient: msg.sender, amount: amount, createdAt: now, claimedAmount: 0})
    );
    userAccumulatedAlpha[msg.sender] = 0;
    emit ReceiptCreated(receipts.length.sub(1), msg.sender, amount);
    return receipts.length.sub(1);
  }

  /**
   * @dev claim receipt by receipt ID
   * @param _receiptID the ID of the receipt to claim
   */
  function claim(uint256 _receiptID) external override nonReentrant {
    require(_receiptID < receipts.length, "Receipt ID not found");
    Receipt storage receipt = receipts[_receiptID];
    require(msg.sender == receipt.recipient, "Only receipt recipient can claim this receipt");
    uint256 duration = now.sub(receipt.createdAt) < vestingDuration
      ? now.sub(receipt.createdAt)
      : vestingDuration;
    uint256 pending = duration.mul(receipt.amount).div(vestingDuration).sub(receipt.claimedAmount);
    receipt.claimedAmount = receipt.claimedAmount.add(pending);
    alphaToken.transfer(receipt.recipient, pending);
    emit ReceiptClaimed(_receiptID, pending);
  }
}
