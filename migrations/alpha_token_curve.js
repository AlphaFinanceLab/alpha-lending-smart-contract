const BigNumber = require("bignumber.js");
const fs = require("fs");

const ALPHA_TOKEN_DECIMALS = 18;
const WAD = BigNumber(10).pow(ALPHA_TOKEN_DECIMALS);

const toUnit = (number) => {
  return BigNumber(number.toString()).times(WAD);
};

const toFullToken = (number) => {
  return BigNumber(number.toString()).dividedBy(WAD);
};

const alphaTokenCurve = (start, percentChange, supply) => {
  console.log("start...");
  const BLOCK_PER_WEEK = BigNumber(120960);
  const supplyUnit = toUnit(supply);
  const alphaTokenPerBlockWeek = [];
  let weekIndex = 0;
  const baseCumulative = BigNumber(100).minus(percentChange);
  let distributedToken = BigNumber(0);
  while (distributedToken.isLessThan(supplyUnit)) {
    console.log("-------------------------------------");
    console.log("baseCumulative percent", baseCumulative.div(100).toString());
    console.log(
      "baseCumulative percent with pow",
      baseCumulative.div(100).pow(weekIndex).toString()
    );
    const tokenPerBlock = BigNumber(start).times(baseCumulative.div(100).pow(weekIndex));
    console.log("tokenPerBlock", tokenPerBlock.dp(ALPHA_TOKEN_DECIMALS).toString());
    const roundTokenPerBlock = tokenPerBlock.dp(ALPHA_TOKEN_DECIMALS);
    console.log("roundTokenPerBlock", roundTokenPerBlock.toString());
    const roundTokenPerBlockUnit = toUnit(roundTokenPerBlock);
    console.log("roundTokenPerBlockUnit", roundTokenPerBlockUnit.toString());

    const tokenPerWeek = roundTokenPerBlockUnit.times(BLOCK_PER_WEEK);
    console.log("tokenPerWeek", tokenPerWeek.toString());
    console.log("tokenPerWeek", toFullToken(tokenPerWeek).toString());

    const remainSupply = toUnit(BigNumber(supply)).minus(distributedToken);
    if (tokenPerWeek.isGreaterThan(remainSupply)) {
      alphaTokenPerBlockWeek.push(roundTokenPerBlockUnit);
      distributedToken = distributedToken.plus(remainSupply);
    } else {
      alphaTokenPerBlockWeek.push(roundTokenPerBlockUnit);
      distributedToken = distributedToken.plus(tokenPerWeek);
    }
    if (weekIndex === 51) {
      break;
    }
    weekIndex += 1;
  }

  for (let index = 0; index < alphaTokenPerBlockWeek.length; index++) {
    console.log("week", index + 1, " : ", alphaTokenPerBlockWeek[index].toString(), " tokens");
  }

  console.log("distributedToken: ", toFullToken(distributedToken).toString());
  console.log("distributedToken(unit): ", distributedToken.toString());
  console.log("total weeks: ", alphaTokenPerBlockWeek.length);

  const content = {
    start: BigNumber(start),
    percentChange: BigNumber(percentChange),
    supply: BigNumber(supply),
    alphaTokenPerBlockWeek: alphaTokenPerBlockWeek,
    distributedToken: distributedToken,
  };
  fs.writeFile("alpha_pool2_curve.json", JSON.stringify(content), function (err) {
    if (err) throw err;
    console.log("Saved!");
  });
  return alphaTokenPerBlockWeek;
};

alphaTokenCurve(45, 5, 393960679);
