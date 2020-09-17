pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {IStdReference} from "./interfaces/IStdReference.sol";
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
  IStdReference ref;

  /**
  @notice Mapping between asset address and token pair strings
  **/
  mapping(address => string[2]) public tokenToPair;

  /**
   * @notice Contract constructor
   * @dev Initializes a new BandPriceOracle instance.
   * @param _ref Band's StdReference contract
   **/
  constructor(IStdReference _ref) public {
    ref = _ref;
  }

  /**
   * @notice Sets the mapping between an asset address and the corresponding Band's Bridge RequestPacket struct
   * @param _asset The token address the asset
   * @param _pair The symbol pair associated with _asset
   **/
  function setTokenPairMap(address _asset, string[2] memory _pair) public onlyOwner {
    tokenToPair[_asset] = _pair;
  }

  /**
   * @notice Returns the latest price of an asset given the asset's address
   * @dev The function uses `tokenToPair` to get the symbol string pair associated with the input `_asset``
   * It then uses that the pair string as a parameter to Band's StdReference contract's `getReferenceData` method to get * the latest price of the asset.
   * @param _asset The asset address
   **/
  function getAssetPrice(address _asset) external override view returns (uint256) {
    string[2] memory pair = tokenToPair[_token];

    IStdReference.ReferenceData memory rate = ref.getReferenceData(pair[0], pair[1]);
    return rate.rate;
  }
}
