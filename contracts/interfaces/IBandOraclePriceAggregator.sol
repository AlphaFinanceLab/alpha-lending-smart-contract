pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

interface IBandOracleAggregator {
    function getReferenceData(string[] memory pairs)
    external
    view
    returns (uint256[] memory);
}
