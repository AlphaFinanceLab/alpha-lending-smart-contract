const DefaultPoolConfiguration = artifacts.require("./DefaultPoolConfiguration.sol");
const BNBToken = artifacts.require("./mock/BNBToken.sol");
const truffleAssert = require("truffle-assertions");
const BigNumber = require("bignumber.js");
const {WAD, OPTIMAL_UTILIZATION_RATE, EXCESS_UTILIZATION_RATE} = require("./helper.js");
const chai = require("chai");
const {expect} = require("chai");
chai.use(require("chai-bignumber")(BigNumber));

contract("DefaultPoolConfiguration", () => {
  let baseRate;
  let slope1Rate;
  let slope2Rate;
  let collateralPercent;
  let liquidationBonus;
  let defaultPoolConfigInstance;

  beforeEach(async () => {
    bnbToken = await BNBToken.new();
    baseRate = BigNumber(0.1).times(WAD);
    slope1Rate = BigNumber(0.2).times(WAD);
    slope2Rate = BigNumber(0.4).times(WAD);
    collateralPercent = BigNumber(0.75).times(WAD);
    liquidationBonus = BigNumber(1.05).times(WAD);
    defaultPoolConfigInstance = await DefaultPoolConfiguration.new(
      baseRate,
      slope1Rate,
      slope2Rate,
      collateralPercent,
      liquidationBonus
    );
  });

  it(`Should get the correct base rate`, async () => {
    const actualBaseRate = await defaultPoolConfigInstance.getBaseBorrowRate();
    expect(BigNumber(actualBaseRate)).to.be.bignumber.eq(baseRate.toFixed(0), "Invalid base rate");
  });

  it(`Should calculate the correct interest rate at 0% utilizationa rate`, async () => {
    const availableLiquidity = BigNumber(100).times(WAD);
    const totalBorrows = BigNumber(0).times(WAD);
    const totalReserves = BigNumber(0).times(WAD);

    const result = await defaultPoolConfigInstance.calculateInterestRate(
      totalBorrows,
      availableLiquidity.plus(totalBorrows).minus(totalReserves)
    );
    const borrowInterestRate = BigNumber(result);

    expect(borrowInterestRate).to.be.bignumber.eq(
      baseRate.toFixed(0),
      "Invalid borrow interest rate"
    );
  });

  it(`Should calculate the correct interest rate`, async () => {
    const availableLiquidity = BigNumber(65).times(WAD);
    const totalBorrows = BigNumber(48.9995545).times(WAD);
    const totalReserves = BigNumber(0.0000007).times(WAD);

    const expectedUtilizationRate = totalBorrows
      .times(WAD)
      .dividedBy(availableLiquidity.plus(totalBorrows).minus(totalReserves));
    const expectedBorrowRate = baseRate
      .plus(expectedUtilizationRate.times(slope1Rate).dividedBy(OPTIMAL_UTILIZATION_RATE))
      .integerValue(BigNumber.ROUND_DOWN);

    const result = await defaultPoolConfigInstance.calculateInterestRate(
      totalBorrows,
      availableLiquidity.plus(totalBorrows).minus(totalReserves)
    );
    const borrowInterestRate = BigNumber(result);

    expect(borrowInterestRate).to.be.bignumber.eq(
      expectedBorrowRate.toFixed(0),
      "Invalid borrow interest rate"
    );
  });

  it(`Should calculate the correct interest rate at 80% utilizationa rate`, async () => {
    const availableLiquidity = BigNumber(21).times(WAD);
    const totalBorrows = BigNumber(78).times(WAD);
    const totalReserves = BigNumber(1).times(WAD);
    const expectedUtilizationRate = totalBorrows
      .times(WAD)
      .dividedBy(availableLiquidity.plus(totalBorrows).minus(totalReserves))
      .integerValue(BigNumber.ROUND_DOWN);
    const expectedBorrowRate = baseRate
      .plus(
        expectedUtilizationRate
          .times(slope1Rate)
          .dividedBy(OPTIMAL_UTILIZATION_RATE)
          .integerValue(BigNumber.ROUND_DOWN)
      )
      .integerValue(BigNumber.ROUND_DOWN);
    const result = await defaultPoolConfigInstance.calculateInterestRate(
      totalBorrows,
      availableLiquidity.plus(totalBorrows).minus(totalReserves).integerValue(BigNumber.ROUND_DOWN)
    );
    const borrowInterestRate = BigNumber(result);

    expect(borrowInterestRate).to.be.bignumber.eq(
      expectedBorrowRate,
      "Invalid borrow interest rate"
    );
  });

  it(`Should calculate the correct interest rate at 99% utilizationa rate`, async () => {
    const availableLiquidity = BigNumber(1).times(WAD);
    const totalBorrows = BigNumber(99).times(WAD);
    const totalReserves = BigNumber(0.00005).times(WAD);
    const utilizationRate = totalBorrows
      .times(WAD)
      .dividedBy(availableLiquidity.plus(totalBorrows).minus(totalReserves));

    const exceedUtilizationRateRatio = utilizationRate
      .minus(OPTIMAL_UTILIZATION_RATE)
      .times(WAD)
      .dividedBy(EXCESS_UTILIZATION_RATE);
    const expectedBorrowRate = baseRate
      .plus(slope1Rate)
      .plus(exceedUtilizationRateRatio.times(slope2Rate).dividedBy(WAD))
      .integerValue(BigNumber.ROUND_DOWN);

    const result = await defaultPoolConfigInstance.calculateInterestRate(
      totalBorrows,
      availableLiquidity.plus(totalBorrows).minus(totalReserves)
    );
    const borrowInterestRate = BigNumber(result);

    expect(borrowInterestRate).to.be.bignumber.eq(
      expectedBorrowRate,
      "Invalid borrow interest rate"
    );
  });

  it(`Should calculate the correct interest rate at 100% utilizationa rate`, async () => {
    const availableLiquidity = BigNumber(0).times(WAD);
    const totalBorrows = BigNumber(100).times(WAD);
    const totalReserves = BigNumber(0.00005).times(WAD);
    const utilizationRate = totalBorrows
      .times(WAD)
      .dividedBy(availableLiquidity.plus(totalBorrows).minus(totalReserves));

    const exceedUtilizationRateRatio = utilizationRate
      .minus(OPTIMAL_UTILIZATION_RATE)
      .times(WAD)
      .dividedBy(EXCESS_UTILIZATION_RATE);
    const expectedBorrowRate = baseRate
      .plus(slope1Rate)
      .plus(exceedUtilizationRateRatio.times(slope2Rate).dividedBy(WAD))
      .integerValue(BigNumber.ROUND_DOWN);

    const result = await defaultPoolConfigInstance.calculateInterestRate(
      totalBorrows,
      availableLiquidity.plus(totalBorrows).minus(totalReserves)
    );
    const borrowInterestRate = BigNumber(result);

    expect(borrowInterestRate).to.be.bignumber.eq(
      expectedBorrowRate,
      "Invalid borrow interest rate"
    );
  });
});
