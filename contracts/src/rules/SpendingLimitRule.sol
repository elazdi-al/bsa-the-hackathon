// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IRule} from "../IRule.sol";

/// Daily spending limit per token (address(0) = ETH), counting ERC-20 transfer and approve
/// amounts. Lowering a limit applies at once; raising it waits RAISE_DELAY, so a thief who
/// gets past every other check still cannot raise the limit and empty the wallet in one go.
/// The account configures it by calling setLimit through its own execute.
contract SpendingLimitRule is IRule {
    uint256 public constant RAISE_DELAY = 1 days;

    struct Limit {
        uint256 daily; // 0 = no limit
        uint256 spent;
        uint64 day;
        uint64 pendingAfter;
        uint256 pending;
    }

    mapping(address account => mapping(address token => Limit)) public limits;

    event LimitSet(address indexed account, address indexed token, uint256 daily, uint64 effectiveAt);

    error LimitExceeded(address token, uint256 daily);

    function setLimit(address token, uint256 daily) external {
        Limit storage l = limits[msg.sender][token];
        _applyPending(l);
        if (l.daily == 0 && daily == 0) return;
        bool lowering = daily != 0 && (l.daily == 0 || daily <= l.daily);
        if (lowering) {
            l.daily = daily;
            l.pendingAfter = 0;
            emit LimitSet(msg.sender, token, daily, uint64(block.timestamp));
        } else {
            l.pending = daily;
            l.pendingAfter = uint64(block.timestamp + RAISE_DELAY);
            emit LimitSet(msg.sender, token, daily, l.pendingAfter);
        }
    }

    function check(address target, uint256 value, bytes calldata data) external {
        if (value > 0) _spend(address(0), value);
        if (data.length >= 68) {
            bytes4 selector = bytes4(data);
            if (selector == IERC20.transfer.selector || selector == IERC20.approve.selector) {
                (, uint256 amount) = abi.decode(data[4:68], (address, uint256));
                _spend(target, amount);
            }
        }
    }

    function _spend(address token, uint256 amount) internal {
        Limit storage l = limits[msg.sender][token];
        _applyPending(l);
        if (l.daily == 0) return;
        uint64 today = uint64(block.timestamp / 1 days);
        if (l.day != today) {
            l.day = today;
            l.spent = 0;
        }
        l.spent += amount;
        if (l.spent > l.daily) revert LimitExceeded(token, l.daily);
    }

    function _applyPending(Limit storage l) internal {
        if (l.pendingAfter != 0 && block.timestamp >= l.pendingAfter) {
            l.daily = l.pending;
            l.pendingAfter = 0;
        }
    }
}
