pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {IBandOracleAggregator} from "./interfaces/IBandOraclePriceAggregator.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title BandPriceOracle contract
 * @notice Implements the actions of the BandPriceOracle
 * @dev Exposes a method to set the Band oracle request packet corresponding to a ERC20 asset address
 * as well as a method to query the latest price of an asset from Band's bridge
 * @author Alpha
 */

contract BandPriceOracle is IPriceOracle, Ownable {
  /**
  @notice BandChain's BridgeWithCache interface
  **/
  IBandOracleAggregator public aggregator;

  /**
  @notice Mapping between asset address and BandChain's oracle request packet
  **/
  mapping(address => string) public tokenToPair;

  /**
   * @notice Contract constructor
   * @dev Initializes a new BandPriceOracle instance.
   * @param _aggregator Band's aggregator proxy contract
   **/
  constructor(IBandOracleAggregator _aggregator) public {
    aggregator = _aggregator;
  }

  /**
   * @notice Sets the mapping between an asset address and the corresponding Band's Bridge RequestPacket struct
   * @param _asset The token address the asset
   * @param _pair The symbol pair associated with _asset
   **/
  function setTokenPairMap(address _asset, string memory _pair) public onlyOwner {
    tokenToPair[_asset] = _pair;
  }

  /**
   * @notice Returns the latest price of an asset given the asset's address
   * @dev The function uses `tokenToPair` to get the symbol string pair associated with the input `_asset``
   * It then uses that the pair string as a parameter to Band's aggregator contract's `getReferenceDAta` method to get * the latest price of the asset.
   * @param _asset The asset address
   **/
  function getAssetPrice(address _asset) external override view returns (uint256) {
    uint256[] memory rates;
    string[] memory pairs = new string[](1);

    pairs[0] = tokenToPair[_asset];
    rates = aggregator.getReferenceData(pairs);
    return rates[0];
  }
}
