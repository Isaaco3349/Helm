// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract HelmVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum IntentStatus {
        None,
        Locked,
        Released,
        Refunded,
        Cancelled
    }

    struct PaymentIntent {
        address executor;
        address payee;
        bytes32 serviceRef;
        bytes32 proofHash;
        uint96 amount;
        uint64 deadline;
        IntentStatus status;
    }

    struct ScheduledPayment {
        address payee;
        bytes32 labelRef;
        uint96 amount;
        uint32 intervalSeconds;
        uint64 nextRunAt;
        uint32 runsRemaining;
        bool active;
    }

    uint32 public constant WEEKLY = 7 days;
    uint32 public constant MONTHLY = 30 days; // 30-day approximation for monthly intervals
    uint256 public constant MAX_BATCH = 50;

    IERC20 public immutable usdc;
    mapping(address => bool) public executors;
    mapping(address => bool) public allowlistedPayees;

    uint96 public autoApproveMax;
    uint96 public dailySpendLimit;
    uint96 public spentToday;
    uint64 public dayBucket;

    uint256 public nextIntentId;
    mapping(uint256 => PaymentIntent) public intents;

    uint256 public nextScheduleId;
    mapping(uint256 => ScheduledPayment) public schedules;

    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event ExecutorAdded(address indexed executor);
    event ExecutorRemoved(address indexed executor);
    event PayeeAdded(address indexed payee);
    event PayeeRemoved(address indexed payee);
    event PolicyUpdated(uint96 autoApproveMax, uint96 dailySpendLimit);
    event IntentInstantPaid(
        uint256 indexed intentId,
        address indexed executor,
        address indexed payee,
        uint96 amount,
        bytes32 serviceRef
    );
    event IntentLocked(
        uint256 indexed intentId,
        address indexed executor,
        address indexed payee,
        uint96 amount,
        uint64 deadline
    );
    event IntentReleased(uint256 indexed intentId, bytes32 proofHash);
    event IntentRefunded(uint256 indexed intentId);
    event IntentCancelled(uint256 indexed intentId);
    event ScheduleCreated(uint256 indexed scheduleId, address indexed payee, uint96 amount, uint32 intervalSeconds);
    event ScheduleCancelled(uint256 indexed scheduleId);
    event ScheduleExecuted(uint256 indexed scheduleId, address indexed payee, uint96 amount);

    constructor(address _owner, address _usdc) Ownable(_owner) {
        // Ownable(_owner) already reverts for address(0); _usdc has no OZ guard
        require(_usdc != address(0), "usdc is zero");
        usdc = IERC20(_usdc);
        dayBucket = uint64(block.timestamp / 1 days);
    }

    function deposit(uint256 amount) external onlyOwner nonReentrant {
        require(amount > 0, "amount is zero");
        // msg.sender == owner() here (enforced by onlyOwner); use msg.sender to
        // avoid the "arbitrary-from" Slither false-positive on owner()
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external onlyOwner nonReentrant {
        require(amount > 0, "amount is zero");
        require(usdc.balanceOf(address(this)) >= amount, "insufficient vault balance");
        usdc.safeTransfer(owner(), amount);
        emit Withdrawn(owner(), amount);
    }

    function addExecutor(address executor) external onlyOwner {
        require(executor != address(0), "executor is zero");
        executors[executor] = true;
        emit ExecutorAdded(executor);
    }

    function removeExecutor(address executor) external onlyOwner {
        require(executor != address(0), "executor is zero");
        executors[executor] = false;
        emit ExecutorRemoved(executor);
    }

    function addPayee(address payee) external onlyOwner {
        require(payee != address(0), "payee is zero");
        allowlistedPayees[payee] = true;
        emit PayeeAdded(payee);
    }

    function removePayee(address payee) external onlyOwner {
        require(payee != address(0), "payee is zero");
        allowlistedPayees[payee] = false;
        emit PayeeRemoved(payee);
    }

    function setAutoApproveMax(uint96 amount) external onlyOwner {
        autoApproveMax = amount;
        emit PolicyUpdated(autoApproveMax, dailySpendLimit);
    }

    function setDailySpendLimit(uint96 limit) external onlyOwner {
        dailySpendLimit = limit;
        emit PolicyUpdated(autoApproveMax, dailySpendLimit);
    }

    function submitIntent(
        address payee,
        bytes32 serviceRef,
        uint96 amount,
        uint64 deadline
    ) external nonReentrant returns (uint256 intentId) {
        require(executors[msg.sender], "not executor");
        require(payee != address(0), "payee is zero");
        require(amount > 0, "amount is zero");
        require(deadline > block.timestamp, "deadline not future");
        require(usdc.balanceOf(address(this)) >= amount, "insufficient vault balance");

        intentId = nextIntentId;
        nextIntentId = intentId + 1;

        bool instantLane = amount <= autoApproveMax && allowlistedPayees[payee];

        if (instantLane) {
            _consumeDailySpend(amount);

            intents[intentId] = PaymentIntent({
                executor: msg.sender,
                payee: payee,
                serviceRef: serviceRef,
                proofHash: bytes32(0),
                amount: amount,
                deadline: deadline,
                status: IntentStatus.Released
            });

            usdc.safeTransfer(payee, amount);
            emit IntentInstantPaid(intentId, msg.sender, payee, amount, serviceRef);
        } else {
            intents[intentId] = PaymentIntent({
                executor: msg.sender,
                payee: payee,
                serviceRef: serviceRef,
                proofHash: bytes32(0),
                amount: amount,
                deadline: deadline,
                status: IntentStatus.Locked
            });

            emit IntentLocked(intentId, msg.sender, payee, amount, deadline);
        }
    }

    function approveIntent(uint256 intentId) external onlyOwner nonReentrant {
        PaymentIntent storage intent = intents[intentId];
        require(intent.status == IntentStatus.Locked, "intent not locked");

        intent.status = IntentStatus.Released;
        _consumeDailySpend(intent.amount);
        usdc.safeTransfer(intent.payee, intent.amount);

        emit IntentReleased(intentId, intent.proofHash);
    }

    function releaseIntent(uint256 intentId, bytes32 proofHash) external onlyOwner nonReentrant {
        PaymentIntent storage intent = intents[intentId];
        require(intent.status == IntentStatus.Locked, "intent not locked");

        intent.proofHash = proofHash;
        intent.status = IntentStatus.Released;
        _consumeDailySpend(intent.amount);

        usdc.safeTransfer(intent.payee, intent.amount);
        emit IntentReleased(intentId, proofHash);
    }

    function refundIntent(uint256 intentId) external onlyOwner {
        PaymentIntent storage intent = intents[intentId];
        require(intent.status == IntentStatus.Locked, "intent not locked");
        require(block.timestamp >= intent.deadline, "deadline not reached");

        intent.status = IntentStatus.Refunded;
        emit IntentRefunded(intentId);
    }

    function cancelIntent(uint256 intentId) external onlyOwner {
        PaymentIntent storage intent = intents[intentId];
        require(intent.status == IntentStatus.Locked, "intent not locked");

        intent.status = IntentStatus.Cancelled;
        emit IntentCancelled(intentId);
    }

    function createSchedule(
        address payee,
        bytes32 labelRef,
        uint96 amount,
        uint32 intervalSeconds,
        uint64 startAt,
        uint32 runsRemaining
    ) external onlyOwner returns (uint256 scheduleId) {
        require(payee != address(0), "payee is zero");
        require(amount > 0, "amount is zero");
        require(intervalSeconds == WEEKLY || intervalSeconds == MONTHLY, "invalid interval");

        scheduleId = nextScheduleId;
        nextScheduleId = scheduleId + 1;

        schedules[scheduleId] = ScheduledPayment({
            payee: payee,
            labelRef: labelRef,
            amount: amount,
            intervalSeconds: intervalSeconds,
            nextRunAt: startAt,
            runsRemaining: runsRemaining,
            active: true
        });

        emit ScheduleCreated(scheduleId, payee, amount, intervalSeconds);
    }

    function cancelSchedule(uint256 scheduleId) external onlyOwner {
        ScheduledPayment storage schedule = schedules[scheduleId];
        require(schedule.active, "schedule inactive");

        schedule.active = false;
        emit ScheduleCancelled(scheduleId);
    }

    function executeDueSchedules(uint256[] calldata scheduleIds) external nonReentrant {
        require(scheduleIds.length <= MAX_BATCH, "batch too large");

        uint256 length = scheduleIds.length;
        for (uint256 i = 0; i < length; i++) {
            uint256 scheduleId = scheduleIds[i];
            ScheduledPayment storage schedule = schedules[scheduleId];

            if (!schedule.active) {
                continue;
            }
            if (block.timestamp < schedule.nextRunAt) {
                continue;
            }
            if (usdc.balanceOf(address(this)) < schedule.amount) {
                continue;
            }
            if (dailySpendLimit > 0) {
                uint64 currentBucket = uint64(block.timestamp / 1 days);
                uint96 effectiveSpent = (currentBucket != dayBucket) ? 0 : spentToday;
                if (effectiveSpent + schedule.amount > dailySpendLimit) {
                    continue;
                }
                // update bucket and spent
                if (currentBucket != dayBucket) {
                    dayBucket = currentBucket;
                    spentToday = 0;
                }
                spentToday += schedule.amount;
            }

            schedule.nextRunAt = uint64(uint256(schedule.nextRunAt) + uint256(schedule.intervalSeconds));

            if (schedule.runsRemaining > 0) {
                schedule.runsRemaining -= 1;
                if (schedule.runsRemaining == 0) {
                    schedule.active = false;
                }
            }

            usdc.safeTransfer(schedule.payee, schedule.amount);
            emit ScheduleExecuted(scheduleId, schedule.payee, schedule.amount);
        }
    }

    function _consumeDailySpend(uint96 amount) internal {
        uint64 currentBucket = uint64(block.timestamp / 1 days);
        if (currentBucket != dayBucket) {
            dayBucket = currentBucket;
            spentToday = 0;
        }

        uint96 newSpent = spentToday + amount;
        if (dailySpendLimit > 0) {
            require(newSpent <= dailySpendLimit, "daily limit exceeded");
        }

        spentToday = newSpent;
    }
}
