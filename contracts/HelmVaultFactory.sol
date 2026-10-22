// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {HelmVault} from "./HelmVault.sol";

contract HelmVaultFactory {
    address public immutable usdc;
    address[] public vaults;
    mapping(address => address) public ownerToVault;

    event VaultCreated(address indexed vault, address indexed owner);

    constructor(address _usdc) {
        require(_usdc != address(0), "usdc is zero");
        usdc = _usdc;
    }

    function createVault() external returns (address vault) {
        vault = address(new HelmVault(msg.sender, usdc));
        ownerToVault[msg.sender] = vault;
        vaults.push(vault);
        emit VaultCreated(vault, msg.sender);
    }

    function getVault(address owner) external view returns (address) {
        return ownerToVault[owner];
    }

    function getAllVaults() external view returns (address[] memory) {
        return vaults;
    }
}
