// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// A transaction rule installed on a SwissquoteAccount. The account calls `check` before
/// every outgoing call (calls to itself excepted), with msg.sender = the account.
/// Revert to block the call. Rules run during execution, so they may keep per-account
/// state and read block.timestamp.
interface IRule {
    function check(address target, uint256 value, bytes calldata data) external;
}
