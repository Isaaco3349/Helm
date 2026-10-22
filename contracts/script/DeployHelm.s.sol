// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {HelmVaultFactory} from "../HelmVaultFactory.sol";

/// @notice Deploys HelmVaultFactory to Arc mainnet.
///
/// Run with:
///   forge script contracts/script/DeployHelm.s.sol \
///     --rpc-url arc_mainnet \
///     --broadcast \
///     --private-key $PRIVATE_KEY \
///     -vvv
///
/// Arc mainnet USDC: 0x3600000000000000000000000000000000000000
/// Source: https://docs.arc.io/arc/references/contract-addresses
contract DeployHelm is Script {
    // Arc mainnet USDC predeploy address
    // Source: https://docs.arc.io/arc/references/contract-addresses
    address constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("Deployer:      ", deployer);
        console.log("USDC address:  ", ARC_USDC);

        vm.startBroadcast(deployerKey);

        HelmVaultFactory factory = new HelmVaultFactory(ARC_USDC);

        vm.stopBroadcast();

        console.log("HelmVaultFactory deployed at:", address(factory));
        console.log("");
        console.log("=== ACTION REQUIRED ===");
        console.log("Set this in .env:");
        console.log("VITE_HELM_FACTORY_ADDRESS=", address(factory));
    }
}
