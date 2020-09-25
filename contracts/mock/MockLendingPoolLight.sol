pragma solidity 0.6.11;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../AlTokenDeployer.sol";
import "../LendingPool.sol";

contract MockLendingPoolLight is LendingPool {
  using SafeMath for uint256;

  constructor(AlTokenDeployer _alTokenDeployer) public LendingPool(_alTokenDeployer) {}

  function mintAlToken(ERC20 _token, address  _recipient, uint256 _amount) external {
    Pool storage pool = pools[address(_token)];
    pool.alToken.mint(_recipient, _amount);
  }

  function burnAlToken(
    ERC20 _token,
    address _user,
    uint256 _amount
  ) external {
    Pool storage pool = pools[address(_token)];
    pool.alToken.burn(_user, _amount);
  }

  function giveAlphaToAlToken(ERC20 _token, uint256 _amount) external {
    Pool storage pool = pools[address(_token)];
    distributor.alphaToken().approve(address(pool.alToken), _amount);
    pool.alToken.receiveAlpha(_amount);
  }
}