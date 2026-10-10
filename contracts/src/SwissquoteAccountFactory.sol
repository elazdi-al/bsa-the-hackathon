// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {SwissquoteAccount} from "./SwissquoteAccount.sol";

/// Deploys accounts as minimal clones at a CREATE2 address bound to their initial config,
/// so the address is known (and can receive funds) before the first UserOperation deploys it.
contract SwissquoteAccountFactory {
    SwissquoteAccount public immutable implementation;

    constructor(IEntryPoint entryPoint) {
        implementation = new SwissquoteAccount(entryPoint);
    }

    function createAccount(SwissquoteAccount.Config calldata config, uint256 salt)
        external
        returns (SwissquoteAccount account)
    {
        bytes32 s = _salt(config, salt);
        address predicted = Clones.predictDeterministicAddress(address(implementation), s);
        if (predicted.code.length > 0) return SwissquoteAccount(payable(predicted));
        account = SwissquoteAccount(payable(Clones.cloneDeterministic(address(implementation), s)));
        account.initialize(config);
    }

    function getAddress(SwissquoteAccount.Config calldata config, uint256 salt) external view returns (address) {
        return Clones.predictDeterministicAddress(address(implementation), _salt(config, salt));
    }

    function _salt(SwissquoteAccount.Config calldata config, uint256 salt) internal pure returns (bytes32) {
        return keccak256(abi.encode(config, salt));
    }
}
