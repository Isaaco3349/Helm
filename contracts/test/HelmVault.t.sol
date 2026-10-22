// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {HelmVault} from "../HelmVault.sol";
import {HelmVaultFactory} from "../HelmVaultFactory.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Invariant handler – drives random vault interactions and tracks locked amounts
// ─────────────────────────────────────────────────────────────────────────────
contract VaultHandler is Test {
    HelmVault public vault;
    MockERC20 public usdc;
    address public owner;
    address public executor;
    address public payee;

    uint256[] public lockedIntentIds;
    uint256 public totalLocked;

    constructor(HelmVault _vault, MockERC20 _usdc, address _owner, address _executor, address _payee) {
        vault = _vault;
        usdc = _usdc;
        owner = _owner;
        executor = _executor;
        payee = _payee;
    }

    /// Deposit more USDC into the vault (owner action).
    function deposit(uint96 amount) external {
        amount = uint96(bound(amount, 1, 100_000e6));
        usdc.mint(owner, amount);
        vm.startPrank(owner);
        usdc.approve(address(vault), amount);
        vault.deposit(amount);
        vm.stopPrank();
    }

    /// Submit an intent that goes to the escrow lane (amount > autoApproveMax = 0 unless payee not allowlisted).
    function submitEscrowIntent(uint96 amount, uint64 deadlineOffset) external {
        uint256 vaultBal = usdc.balanceOf(address(vault));
        if (vaultBal == 0) return;
        // Bound amount so it does not exceed what is truly "free" (vault balance minus already locked)
        uint256 freeBal = vaultBal > totalLocked ? vaultBal - totalLocked : 0;
        if (freeBal == 0) return;
        amount = uint96(bound(amount, 1, freeBal > type(uint96).max ? type(uint96).max : freeBal));
        deadlineOffset = uint64(bound(deadlineOffset, 1, 30 days));
        uint64 deadline = uint64(block.timestamp) + deadlineOffset;

        vm.prank(executor);
        try vault.submitIntent(payee, bytes32(0), amount, deadline) returns (uint256 id) {
            // Only count if it ended up Locked (escrow lane)
            (, , , , , , HelmVault.IntentStatus status) = vault.intents(id);
            if (status == HelmVault.IntentStatus.Locked) {
                lockedIntentIds.push(id);
                totalLocked += amount;
            }
        } catch {}
    }

    /// Release a previously locked intent (owner action).
    function releaseFirst() external {
        if (lockedIntentIds.length == 0) return;
        uint256 id = lockedIntentIds[lockedIntentIds.length - 1];
        (, , , , uint96 amt, , HelmVault.IntentStatus status) = vault.intents(id);
        // Pop regardless of current status so the array doesn't grow unboundedly
        lockedIntentIds.pop();
        if (status != HelmVault.IntentStatus.Locked) return;
        vm.prank(owner);
        // dailySpendLimit is 0 so _consumeDailySpend won't revert
        try vault.approveIntent(id) {
            totalLocked -= amt;
        } catch {
            // re-add if it failed unexpectedly
            lockedIntentIds.push(id);
        }
    }

    /// Cancel a locked intent (owner action).
    function cancelFirst() external {
        if (lockedIntentIds.length == 0) return;
        uint256 id = lockedIntentIds[lockedIntentIds.length - 1];
        (, , , , uint96 amt, , HelmVault.IntentStatus status) = vault.intents(id);
        lockedIntentIds.pop();
        if (status != HelmVault.IntentStatus.Locked) return;
        vm.prank(owner);
        try vault.cancelIntent(id) {
            totalLocked -= amt;
        } catch {
            lockedIntentIds.push(id);
        }
    }

    /// Re-compute totalLocked by scanning all tracked ids (used by invariant).
    function totalLockedAmount() external view returns (uint256 sum) {
        for (uint256 i = 0; i < lockedIntentIds.length; i++) {
            uint256 id = lockedIntentIds[i];
            (, , , , uint96 amt, , HelmVault.IntentStatus status) = vault.intents(id);
            if (status == HelmVault.IntentStatus.Locked) {
                sum += amt;
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main test contract
// ─────────────────────────────────────────────────────────────────────────────
contract HelmVaultTest is Test {
    // ── Addresses ──────────────────────────────────────────────────────────
    address internal owner   = makeAddr("owner");
    address internal alice   = makeAddr("alice");   // executor
    address internal bob     = makeAddr("bob");     // payee
    address internal charlie = makeAddr("charlie"); // uninvolved

    // ── Contracts ──────────────────────────────────────────────────────────
    MockERC20        internal usdc;
    HelmVault        internal vault;
    HelmVaultFactory internal factory;

    // ── Constants ──────────────────────────────────────────────────────────
    uint256 internal constant INITIAL_DEPOSIT = 10_000e6; // 10 000 USDC (6 dp)
    uint96  internal constant AUTO_MAX        = 500e6;    // 500 USDC auto-approve ceiling
    uint96  internal constant DAILY_LIMIT     = 2_000e6;  // 2 000 USDC daily cap

    // Mirror HelmVault constants to avoid consuming vm.prank with external view calls
    uint32  internal constant WEEKLY  = 7 days;
    uint32  internal constant MONTHLY = 30 days;

    // ─────────────────────────────────────────────────────────────────────
    // setUp – fresh state before every test
    // ─────────────────────────────────────────────────────────────────────
    function setUp() public {
        // Deploy mock USDC
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);

        // Deploy vault owned by `owner`
        vault = new HelmVault(owner, address(usdc));

        // Deploy factory (also points at mock USDC)
        factory = new HelmVaultFactory(address(usdc));

        // Fund owner and approve vault
        usdc.mint(owner, INITIAL_DEPOSIT);
        vm.prank(owner);
        usdc.approve(address(vault), type(uint256).max);

        // Owner deposits into vault
        vm.prank(owner);
        vault.deposit(INITIAL_DEPOSIT);

        // Register executor + payee, set policy
        vm.startPrank(owner);
        vault.addExecutor(alice);
        vault.addPayee(bob);
        vault.setAutoApproveMax(AUTO_MAX);
        vault.setDailySpendLimit(DAILY_LIMIT);
        vm.stopPrank();
    }

    // =========================================================================
    // A. FACTORY
    // =========================================================================

    function test_Factory_CreateVault_DeploysWithCorrectOwner() public {
        vm.prank(alice);
        address v = factory.createVault();
        assertEq(HelmVault(v).owner(), alice);
    }

    function test_Factory_CreateVault_EmitsVaultCreated() public {
        // Predict the next vault address using forge's CREATE address formula
        address predicted = computeCreateAddress(address(factory), vm.getNonce(address(factory)));

        vm.prank(alice);
        vm.expectEmit(true, true, false, false, address(factory));
        emit HelmVaultFactory.VaultCreated(predicted, alice);
        factory.createVault();
    }

    function test_Factory_CreateVault_StoresVault() public {
        vm.prank(alice);
        address v = factory.createVault();

        assertEq(factory.getVault(alice), v);
        address[] memory all = factory.getAllVaults();
        assertEq(all.length, 1);
        assertEq(all[0], v);
    }

    function test_Factory_CreateVault_UsesCorrectUsdc() public {
        vm.prank(alice);
        address v = factory.createVault();
        assertEq(address(HelmVault(v).usdc()), address(usdc));
    }

    // =========================================================================
    // B. CONSTRUCTOR / INIT
    // =========================================================================

    function test_Constructor_SetsOwner() public view {
        assertEq(vault.owner(), owner);
    }

    function test_Constructor_SetsUsdc() public view {
        assertEq(address(vault.usdc()), address(usdc));
    }

    function test_Constructor_SetsDayBucket() public view {
        uint64 expected = uint64(block.timestamp / 1 days);
        assertEq(vault.dayBucket(), expected);
    }

    function test_Constructor_RevertsZeroOwner() public {
        // OZ Ownable checks address(0) first and throws OwnableInvalidOwner before
        // the contract's own "owner is zero" require has a chance to run.
        // This is a suspected contract bug: the custom require is unreachable.
        // We test the actual on-chain behaviour (OwnableInvalidOwner) here.
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new HelmVault(address(0), address(usdc));
    }

    function test_Constructor_RevertsZeroUsdc() public {
        vm.expectRevert("usdc is zero");
        new HelmVault(owner, address(0));
    }

    // =========================================================================
    // C. DEPOSIT / WITHDRAW
    // =========================================================================

    function test_Deposit_HappyPath() public {
        uint256 before = usdc.balanceOf(address(vault));
        usdc.mint(owner, 1_000e6);
        vm.prank(owner);
        usdc.approve(address(vault), 1_000e6);
        vm.prank(owner);
        vault.deposit(1_000e6);
        assertEq(usdc.balanceOf(address(vault)), before + 1_000e6);
    }

    function test_Deposit_EmitsDeposited() public {
        usdc.mint(owner, 500e6);
        vm.prank(owner);
        usdc.approve(address(vault), 500e6);

        vm.prank(owner);
        vm.expectEmit(true, false, false, true, address(vault));
        emit HelmVault.Deposited(owner, 500e6);
        vault.deposit(500e6);
    }

    function test_Deposit_RevertsNotOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vault.deposit(1e6);
    }

    function test_Deposit_RevertsZeroAmount() public {
        vm.prank(owner);
        vm.expectRevert("amount is zero");
        vault.deposit(0);
    }

    function test_Withdraw_HappyPath() public {
        uint256 before = usdc.balanceOf(owner);
        vm.prank(owner);
        vault.withdraw(1_000e6);
        assertEq(usdc.balanceOf(owner), before + 1_000e6);
        assertEq(usdc.balanceOf(address(vault)), INITIAL_DEPOSIT - 1_000e6);
    }

    function test_Withdraw_EmitsWithdrawn() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, true, address(vault));
        emit HelmVault.Withdrawn(owner, 1_000e6);
        vault.withdraw(1_000e6);
    }

    function test_Withdraw_RevertsNotOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vault.withdraw(1e6);
    }

    function test_Withdraw_RevertsZeroAmount() public {
        vm.prank(owner);
        vm.expectRevert("amount is zero");
        vault.withdraw(0);
    }

    function test_Withdraw_RevertsInsufficientBalance() public {
        vm.prank(owner);
        vm.expectRevert("insufficient vault balance");
        vault.withdraw(INITIAL_DEPOSIT + 1);
    }

    // =========================================================================
    // D. EXECUTOR MANAGEMENT
    // =========================================================================

    function test_AddExecutor_HappyPath() public {
        vm.prank(owner);
        vault.addExecutor(charlie);
        assertTrue(vault.executors(charlie));
    }

    function test_AddExecutor_EmitsExecutorAdded() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, false, address(vault));
        emit HelmVault.ExecutorAdded(charlie);
        vault.addExecutor(charlie);
    }

    function test_AddExecutor_RevertsNotOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vault.addExecutor(charlie);
    }

    function test_AddExecutor_RevertsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert("executor is zero");
        vault.addExecutor(address(0));
    }

    function test_RemoveExecutor_HappyPath() public {
        vm.prank(owner);
        vault.removeExecutor(alice);
        assertFalse(vault.executors(alice));
    }

    function test_RemoveExecutor_EmitsExecutorRemoved() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, false, address(vault));
        emit HelmVault.ExecutorRemoved(alice);
        vault.removeExecutor(alice);
    }

    function test_RemoveExecutor_RevertsNotOwner() public {
        vm.prank(charlie);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, charlie));
        vault.removeExecutor(alice);
    }

    function test_RemoveExecutor_RevertsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert("executor is zero");
        vault.removeExecutor(address(0));
    }

    // =========================================================================
    // E. PAYEE ALLOWLIST
    // =========================================================================

    function test_AddPayee_HappyPath() public {
        vm.prank(owner);
        vault.addPayee(charlie);
        assertTrue(vault.allowlistedPayees(charlie));
    }

    function test_AddPayee_EmitsPayeeAdded() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, false, address(vault));
        emit HelmVault.PayeeAdded(charlie);
        vault.addPayee(charlie);
    }

    function test_AddPayee_RevertsNotOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vault.addPayee(charlie);
    }

    function test_AddPayee_RevertsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert("payee is zero");
        vault.addPayee(address(0));
    }

    function test_RemovePayee_HappyPath() public {
        vm.prank(owner);
        vault.removePayee(bob);
        assertFalse(vault.allowlistedPayees(bob));
    }

    function test_RemovePayee_EmitsPayeeRemoved() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, false, address(vault));
        emit HelmVault.PayeeRemoved(bob);
        vault.removePayee(bob);
    }

    function test_RemovePayee_RevertsNotOwner() public {
        vm.prank(charlie);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, charlie));
        vault.removePayee(bob);
    }

    function test_RemovePayee_RevertsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert("payee is zero");
        vault.removePayee(address(0));
    }

    // =========================================================================
    // F. POLICY SETTERS
    // =========================================================================

    function test_SetAutoApproveMax_HappyPath() public {
        vm.prank(owner);
        vault.setAutoApproveMax(999e6);
        assertEq(vault.autoApproveMax(), 999e6);
    }

    function test_SetAutoApproveMax_EmitsPolicyUpdated() public {
        vm.prank(owner);
        vm.expectEmit(false, false, false, true, address(vault));
        emit HelmVault.PolicyUpdated(999e6, DAILY_LIMIT);
        vault.setAutoApproveMax(999e6);
    }

    function test_SetAutoApproveMax_RevertsNotOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vault.setAutoApproveMax(1e6);
    }

    function test_SetDailySpendLimit_HappyPath() public {
        vm.prank(owner);
        vault.setDailySpendLimit(5_000e6);
        assertEq(vault.dailySpendLimit(), 5_000e6);
    }

    function test_SetDailySpendLimit_EmitsPolicyUpdated() public {
        vm.prank(owner);
        vm.expectEmit(false, false, false, true, address(vault));
        emit HelmVault.PolicyUpdated(AUTO_MAX, 5_000e6);
        vault.setDailySpendLimit(5_000e6);
    }

    function test_SetDailySpendLimit_RevertsNotOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vault.setDailySpendLimit(1e6);
    }

    // =========================================================================
    // G. SUBMIT INTENT – instant lane
    // =========================================================================

    function test_SubmitIntent_InstantLane_TransfersUsdc() public {
        uint256 bobBefore = usdc.balanceOf(bob);
        vm.prank(alice);
        vault.submitIntent(bob, bytes32("ref1"), 100e6, uint64(block.timestamp + 1 hours));
        assertEq(usdc.balanceOf(bob), bobBefore + 100e6);
        assertEq(usdc.balanceOf(address(vault)), INITIAL_DEPOSIT - 100e6);
    }

    function test_SubmitIntent_InstantLane_StatusReleased() public {
        vm.prank(alice);
        uint256 id = vault.submitIntent(bob, bytes32("ref1"), 100e6, uint64(block.timestamp + 1 hours));
        (, , , , , , HelmVault.IntentStatus status) = vault.intents(id);
        assertEq(uint8(status), uint8(HelmVault.IntentStatus.Released));
    }

    function test_SubmitIntent_InstantLane_EmitsIntentInstantPaid() public {
        vm.prank(alice);
        vm.expectEmit(true, true, true, true, address(vault));
        emit HelmVault.IntentInstantPaid(0, alice, bob, 100e6, bytes32("ref1"));
        vault.submitIntent(bob, bytes32("ref1"), 100e6, uint64(block.timestamp + 1 hours));
    }

    function test_SubmitIntent_InstantLane_ConsumesSpend() public {
        vm.prank(alice);
        vault.submitIntent(bob, bytes32("ref1"), 100e6, uint64(block.timestamp + 1 hours));
        assertEq(vault.spentToday(), 100e6);
    }

    // ─── instant lane blocked when payee not allowlisted ──────────────────
    function test_SubmitIntent_EscrowLane_PayeeNotAllowlisted() public {
        vm.prank(alice);
        uint256 id = vault.submitIntent(charlie, bytes32("ref2"), 100e6, uint64(block.timestamp + 1 hours));
        (, , , , , , HelmVault.IntentStatus status) = vault.intents(id);
        assertEq(uint8(status), uint8(HelmVault.IntentStatus.Locked));
        // USDC should still be in vault
        assertEq(usdc.balanceOf(address(vault)), INITIAL_DEPOSIT);
    }

    // ─── instant lane blocked when amount > autoApproveMax ────────────────
    function test_SubmitIntent_EscrowLane_AmountExceedsAutoMax() public {
        uint96 bigAmount = AUTO_MAX + 1;
        vm.prank(alice);
        uint256 id = vault.submitIntent(bob, bytes32("ref3"), bigAmount, uint64(block.timestamp + 1 hours));
        (, , , , , , HelmVault.IntentStatus status) = vault.intents(id);
        assertEq(uint8(status), uint8(HelmVault.IntentStatus.Locked));
    }

    // =========================================================================
    // H. SUBMIT INTENT – escrow lane
    // =========================================================================

    function test_SubmitIntent_EscrowLane_EmitsIntentLocked() public {
        uint64 deadline = uint64(block.timestamp + 1 hours);
        vm.prank(alice);
        vm.expectEmit(true, true, true, true, address(vault));
        emit HelmVault.IntentLocked(0, alice, charlie, 1_000e6, deadline);
        vault.submitIntent(charlie, bytes32("ref4"), 1_000e6, deadline);
    }

    function test_SubmitIntent_EscrowLane_UsdcStaysInVault() public {
        vm.prank(alice);
        vault.submitIntent(charlie, bytes32("ref4"), 1_000e6, uint64(block.timestamp + 1 hours));
        assertEq(usdc.balanceOf(address(vault)), INITIAL_DEPOSIT);
    }

    function test_SubmitIntent_EscrowLane_RecordsCorrectFields() public {
        uint64 deadline = uint64(block.timestamp + 2 hours);
        vm.prank(alice);
        uint256 id = vault.submitIntent(charlie, bytes32("myref"), 1_000e6, deadline);
        (
            address executor_,
            address payee_,
            bytes32 serviceRef_,
            ,
            uint96 amount_,
            uint64 deadline_,
            HelmVault.IntentStatus status_
        ) = vault.intents(id);
        assertEq(executor_, alice);
        assertEq(payee_, charlie);
        assertEq(serviceRef_, bytes32("myref"));
        assertEq(amount_, 1_000e6);
        assertEq(deadline_, deadline);
        assertEq(uint8(status_), uint8(HelmVault.IntentStatus.Locked));
    }

    // =========================================================================
    // I. SUBMIT INTENT – revert paths
    // =========================================================================

    function test_SubmitIntent_Revert_NotExecutor() public {
        vm.prank(charlie);
        vm.expectRevert("not executor");
        vault.submitIntent(bob, bytes32(0), 100e6, uint64(block.timestamp + 1));
    }

    function test_SubmitIntent_Revert_ZeroPayee() public {
        vm.prank(alice);
        vm.expectRevert("payee is zero");
        vault.submitIntent(address(0), bytes32(0), 100e6, uint64(block.timestamp + 1));
    }

    function test_SubmitIntent_Revert_ZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert("amount is zero");
        vault.submitIntent(bob, bytes32(0), 0, uint64(block.timestamp + 1));
    }

    function test_SubmitIntent_Revert_DeadlineNotFuture() public {
        vm.prank(alice);
        vm.expectRevert("deadline not future");
        vault.submitIntent(bob, bytes32(0), 100e6, uint64(block.timestamp));
    }

    function test_SubmitIntent_Revert_InsufficientBalance() public {
        vm.prank(alice);
        vm.expectRevert("insufficient vault balance");
        vault.submitIntent(bob, bytes32(0), uint96(INITIAL_DEPOSIT + 1), uint64(block.timestamp + 1));
    }

    function test_SubmitIntent_Revert_DailyLimitExceeded_InstantLane() public {
        // Submit intents that use up the daily limit
        vm.prank(alice);
        vault.submitIntent(bob, bytes32("a"), AUTO_MAX, uint64(block.timestamp + 1 hours));
        vm.prank(alice);
        vault.submitIntent(bob, bytes32("b"), AUTO_MAX, uint64(block.timestamp + 1 hours));
        vm.prank(alice);
        vault.submitIntent(bob, bytes32("c"), AUTO_MAX, uint64(block.timestamp + 1 hours));
        vm.prank(alice);
        vault.submitIntent(bob, bytes32("d"), AUTO_MAX, uint64(block.timestamp + 1 hours));
        // DAILY_LIMIT = 2000e6, AUTO_MAX = 500e6 → 4 × 500 = 2000 used up
        vm.prank(alice);
        vm.expectRevert("daily limit exceeded");
        vault.submitIntent(bob, bytes32("e"), AUTO_MAX, uint64(block.timestamp + 1 hours));
    }

    // =========================================================================
    // J. APPROVE INTENT
    // =========================================================================

    function _lockIntent(uint96 amount) internal returns (uint256 id) {
        // Use charlie (not allowlisted) to force escrow lane
        vm.prank(alice);
        id = vault.submitIntent(charlie, bytes32("ref"), amount, uint64(block.timestamp + 1 hours));
    }

    function test_ApproveIntent_HappyPath() public {
        uint256 id = _lockIntent(1_000e6);
        uint256 charlieBefore = usdc.balanceOf(charlie);

        vm.prank(owner);
        vault.approveIntent(id);

        assertEq(usdc.balanceOf(charlie), charlieBefore + 1_000e6);
        (, , , , , , HelmVault.IntentStatus status) = vault.intents(id);
        assertEq(uint8(status), uint8(HelmVault.IntentStatus.Released));
    }

    function test_ApproveIntent_EmitsIntentReleased() public {
        uint256 id = _lockIntent(1_000e6);
        vm.prank(owner);
        vm.expectEmit(true, false, false, true, address(vault));
        emit HelmVault.IntentReleased(id, bytes32(0));
        vault.approveIntent(id);
    }

    function test_ApproveIntent_ConsumesDailySpend() public {
        uint256 id = _lockIntent(1_000e6);
        vm.prank(owner);
        vault.approveIntent(id);
        assertEq(vault.spentToday(), 1_000e6);
    }

    function test_ApproveIntent_Revert_NotOwner() public {
        uint256 id = _lockIntent(1_000e6);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vault.approveIntent(id);
    }

    function test_ApproveIntent_Revert_NotLocked() public {
        uint256 id = _lockIntent(1_000e6);
        vm.prank(owner);
        vault.cancelIntent(id);

        vm.prank(owner);
        vm.expectRevert("intent not locked");
        vault.approveIntent(id);
    }

    function test_ApproveIntent_Revert_DailyLimitExceeded() public {
        // Lock two intents whose combined amount exceeds the daily limit
        uint256 id1 = _lockIntent(1_500e6);
        uint256 id2 = _lockIntent(1_000e6);

        vm.prank(owner);
        vault.approveIntent(id1); // 1 500 < 2 000 → ok

        vm.prank(owner);
        vm.expectRevert("daily limit exceeded");
        vault.approveIntent(id2); // 1500 + 1000 = 2500 > 2000 → revert
    }

    // =========================================================================
    // K. RELEASE INTENT
    // =========================================================================

    function test_ReleaseIntent_HappyPath() public {
        uint256 id = _lockIntent(1_000e6);
        bytes32 proof = keccak256("proof");
        uint256 charlieBefore = usdc.balanceOf(charlie);

        vm.prank(owner);
        vault.releaseIntent(id, proof);

        assertEq(usdc.balanceOf(charlie), charlieBefore + 1_000e6);
        (, , , bytes32 storedProof, , , HelmVault.IntentStatus status) = vault.intents(id);
        assertEq(storedProof, proof);
        assertEq(uint8(status), uint8(HelmVault.IntentStatus.Released));
    }

    function test_ReleaseIntent_EmitsIntentReleased() public {
        uint256 id = _lockIntent(1_000e6);
        bytes32 proof = keccak256("proof");

        vm.prank(owner);
        vm.expectEmit(true, false, false, true, address(vault));
        emit HelmVault.IntentReleased(id, proof);
        vault.releaseIntent(id, proof);
    }

    function test_ReleaseIntent_SetsProofHash() public {
        uint256 id = _lockIntent(1_000e6);
        bytes32 proof = keccak256("my-proof");
        vm.prank(owner);
        vault.releaseIntent(id, proof);
        (, , , bytes32 storedProof, , ,) = vault.intents(id);
        assertEq(storedProof, proof);
    }

    function test_ReleaseIntent_Revert_NotOwner() public {
        uint256 id = _lockIntent(1_000e6);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vault.releaseIntent(id, bytes32(0));
    }

    function test_ReleaseIntent_Revert_NotLocked() public {
        uint256 id = _lockIntent(1_000e6);
        vm.prank(owner);
        vault.cancelIntent(id);

        vm.prank(owner);
        vm.expectRevert("intent not locked");
        vault.releaseIntent(id, bytes32(0));
    }

    // =========================================================================
    // L. REFUND INTENT
    // =========================================================================

    function test_RefundIntent_HappyPath() public {
        uint64 deadline = uint64(block.timestamp + 1 hours);
        vm.prank(alice);
        uint256 id = vault.submitIntent(charlie, bytes32(0), 1_000e6, deadline);

        // Warp past deadline
        vm.warp(deadline);

        vm.prank(owner);
        vault.refundIntent(id);

        (, , , , , , HelmVault.IntentStatus status) = vault.intents(id);
        assertEq(uint8(status), uint8(HelmVault.IntentStatus.Refunded));
    }

    function test_RefundIntent_EmitsIntentRefunded() public {
        uint64 deadline = uint64(block.timestamp + 1 hours);
        vm.prank(alice);
        uint256 id = vault.submitIntent(charlie, bytes32(0), 1_000e6, deadline);

        vm.warp(deadline);

        vm.prank(owner);
        vm.expectEmit(true, false, false, false, address(vault));
        emit HelmVault.IntentRefunded(id);
        vault.refundIntent(id);
    }

    function test_RefundIntent_Revert_NotOwner() public {
        uint64 deadline = uint64(block.timestamp + 1 hours);
        vm.prank(alice);
        uint256 id = vault.submitIntent(charlie, bytes32(0), 1_000e6, deadline);
        vm.warp(deadline);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vault.refundIntent(id);
    }

    function test_RefundIntent_Revert_NotLocked() public {
        uint256 id = _lockIntent(500e6);
        vm.prank(owner);
        vault.cancelIntent(id);

        vm.prank(owner);
        vm.expectRevert("intent not locked");
        vault.refundIntent(id);
    }

    function test_RefundIntent_Revert_DeadlineNotReached() public {
        uint64 deadline = uint64(block.timestamp + 1 hours);
        vm.prank(alice);
        uint256 id = vault.submitIntent(charlie, bytes32(0), 1_000e6, deadline);

        vm.prank(owner);
        vm.expectRevert("deadline not reached");
        vault.refundIntent(id);
    }

    // =========================================================================
    // M. CANCEL INTENT
    // =========================================================================

    function test_CancelIntent_HappyPath() public {
        uint256 id = _lockIntent(500e6);
        vm.prank(owner);
        vault.cancelIntent(id);
        (, , , , , , HelmVault.IntentStatus status) = vault.intents(id);
        assertEq(uint8(status), uint8(HelmVault.IntentStatus.Cancelled));
    }

    function test_CancelIntent_EmitsIntentCancelled() public {
        uint256 id = _lockIntent(500e6);
        vm.prank(owner);
        vm.expectEmit(true, false, false, false, address(vault));
        emit HelmVault.IntentCancelled(id);
        vault.cancelIntent(id);
    }

    function test_CancelIntent_Revert_NotOwner() public {
        uint256 id = _lockIntent(500e6);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vault.cancelIntent(id);
    }

    function test_CancelIntent_Revert_NotLocked() public {
        uint256 id = _lockIntent(500e6);
        vm.prank(owner);
        vault.cancelIntent(id);

        vm.prank(owner);
        vm.expectRevert("intent not locked");
        vault.cancelIntent(id);
    }

    // =========================================================================
    // N. DAILY SPEND LIMIT
    // =========================================================================

    function test_DailySpend_ResetsBetweenDays() public {
        // Consume most of today's limit
        vm.prank(alice);
        vault.submitIntent(bob, bytes32("x"), AUTO_MAX, uint64(block.timestamp + 1 hours));
        assertEq(vault.spentToday(), AUTO_MAX);

        // Advance one full day
        vm.warp(block.timestamp + 1 days);

        // Should succeed again (bucket reset)
        vm.prank(alice);
        vault.submitIntent(bob, bytes32("y"), AUTO_MAX, uint64(block.timestamp + 1 hours));
        assertEq(vault.spentToday(), AUTO_MAX);
    }

    function test_DailySpend_EscrowLane_ApproveRevertsWhenExceeded() public {
        // Lock a big intent
        uint256 id1 = _lockIntent(1_900e6);
        uint256 id2 = _lockIntent(200e6);

        vm.prank(owner);
        vault.approveIntent(id1); // 1 900 ≤ 2 000 → ok

        vm.prank(owner);
        vm.expectRevert("daily limit exceeded");
        vault.approveIntent(id2); // 1 900 + 200 = 2 100 > 2 000 → revert
    }

    function test_DailySpend_UnlimitedWhenZero() public {
        // Remove daily limit
        vm.prank(owner);
        vault.setDailySpendLimit(0);

        // Submit many small intents summing > old limit without revert
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(alice);
            vault.submitIntent(bob, bytes32(bytes32(i + 1)), AUTO_MAX, uint64(block.timestamp + 1 hours));
        }
        // Verify none reverted – just check vault balance decreased
        assertEq(usdc.balanceOf(address(vault)), INITIAL_DEPOSIT - 5 * AUTO_MAX);
    }

    // =========================================================================
    // O. CREATE SCHEDULE
    // =========================================================================

    function test_CreateSchedule_Weekly_HappyPath() public {
        uint64 startAt = uint64(block.timestamp + 7 days);
        vm.prank(owner);
        uint256 sid = vault.createSchedule(bob, bytes32("lbl"), 100e6, WEEKLY, startAt, 4);

        (
            address payee_,
            ,
            uint96 amount_,
            uint32 interval_,
            uint64 nextRunAt_,
            uint32 runsRemaining_,
            bool active_
        ) = vault.schedules(sid);

        assertEq(payee_, bob);
        assertEq(amount_, 100e6);
        assertEq(interval_, WEEKLY);
        assertEq(nextRunAt_, startAt);
        assertEq(runsRemaining_, 4);
        assertTrue(active_);
    }

    function test_CreateSchedule_Monthly_HappyPath() public {
        uint64 startAt = uint64(block.timestamp + 30 days);
        vm.prank(owner);
        uint256 sid = vault.createSchedule(bob, bytes32("lbl"), 100e6, MONTHLY, startAt, 12);
        (, , , uint32 interval_, , ,) = vault.schedules(sid);
        assertEq(interval_, MONTHLY);
    }

    function test_CreateSchedule_EmitsScheduleCreated() public {
        uint64 startAt = uint64(block.timestamp + 7 days);
        vm.prank(owner);
        vm.expectEmit(true, true, false, true, address(vault));
        emit HelmVault.ScheduleCreated(0, bob, 100e6, WEEKLY);
        vault.createSchedule(bob, bytes32("lbl"), 100e6, WEEKLY, startAt, 4);
    }

    function test_CreateSchedule_Revert_NotOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vault.createSchedule(bob, bytes32("lbl"), 100e6, WEEKLY, uint64(block.timestamp), 4);
    }

    function test_CreateSchedule_Revert_ZeroPayee() public {
        vm.prank(owner);
        vm.expectRevert("payee is zero");
        vault.createSchedule(address(0), bytes32("lbl"), 100e6, WEEKLY, uint64(block.timestamp), 4);
    }

    function test_CreateSchedule_Revert_ZeroAmount() public {
        vm.prank(owner);
        vm.expectRevert("amount is zero");
        vault.createSchedule(bob, bytes32("lbl"), 0, WEEKLY, uint64(block.timestamp), 4);
    }

    function test_CreateSchedule_Revert_InvalidInterval() public {
        vm.prank(owner);
        vm.expectRevert("invalid interval");
        vault.createSchedule(bob, bytes32("lbl"), 100e6, 1 days, uint64(block.timestamp), 4);
    }

    // =========================================================================
    // P. CANCEL SCHEDULE
    // =========================================================================

    function _createWeeklySchedule(uint32 runs) internal returns (uint256 sid) {
        vm.prank(owner);
        sid = vault.createSchedule(bob, bytes32("lbl"), 100e6, WEEKLY, uint64(block.timestamp), runs);
    }

    function test_CancelSchedule_HappyPath() public {
        uint256 sid = _createWeeklySchedule(4);
        vm.prank(owner);
        vault.cancelSchedule(sid);
        (, , , , , , bool active_) = vault.schedules(sid);
        assertFalse(active_);
    }

    function test_CancelSchedule_EmitsScheduleCancelled() public {
        uint256 sid = _createWeeklySchedule(4);
        vm.prank(owner);
        vm.expectEmit(true, false, false, false, address(vault));
        emit HelmVault.ScheduleCancelled(sid);
        vault.cancelSchedule(sid);
    }

    function test_CancelSchedule_Revert_NotOwner() public {
        uint256 sid = _createWeeklySchedule(4);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vault.cancelSchedule(sid);
    }

    function test_CancelSchedule_Revert_AlreadyInactive() public {
        uint256 sid = _createWeeklySchedule(4);
        vm.prank(owner);
        vault.cancelSchedule(sid);
        vm.prank(owner);
        vm.expectRevert("schedule inactive");
        vault.cancelSchedule(sid);
    }

    // =========================================================================
    // Q. EXECUTE DUE SCHEDULES
    // =========================================================================

    function test_ExecuteDueSchedules_TransfersUsdc() public {
        uint256 sid = _createWeeklySchedule(4);
        uint256 bobBefore = usdc.balanceOf(bob);
        uint256[] memory ids = new uint256[](1);
        ids[0] = sid;
        vault.executeDueSchedules(ids);
        assertEq(usdc.balanceOf(bob), bobBefore + 100e6);
    }

    function test_ExecuteDueSchedules_UpdatesNextRunAt() public {
        uint64 startAt = uint64(block.timestamp);
        vm.prank(owner);
        uint256 sid = vault.createSchedule(bob, bytes32("lbl"), 100e6, WEEKLY, startAt, 4);
        uint256[] memory ids = new uint256[](1);
        ids[0] = sid;
        vault.executeDueSchedules(ids);
        (, , , uint32 interval_, uint64 nextRunAt_, ,) = vault.schedules(sid);
        assertEq(nextRunAt_, startAt + interval_);
    }

    function test_ExecuteDueSchedules_DecrementsRunsRemaining() public {
        uint256 sid = _createWeeklySchedule(3);
        uint256[] memory ids = new uint256[](1);
        ids[0] = sid;
        vault.executeDueSchedules(ids);
        (, , , , , uint32 runs_,) = vault.schedules(sid);
        assertEq(runs_, 2);
    }

    function test_ExecuteDueSchedules_SetsInactiveWhenRunsHitZero() public {
        uint256 sid = _createWeeklySchedule(1);
        uint256[] memory ids = new uint256[](1);
        ids[0] = sid;
        vault.executeDueSchedules(ids);
        (, , , , , uint32 runs_, bool active_) = vault.schedules(sid);
        assertEq(runs_, 0);
        assertFalse(active_);
    }

    function test_ExecuteDueSchedules_EmitsScheduleExecuted() public {
        uint256 sid = _createWeeklySchedule(4);
        uint256[] memory ids = new uint256[](1);
        ids[0] = sid;
        vm.expectEmit(true, true, false, true, address(vault));
        emit HelmVault.ScheduleExecuted(sid, bob, 100e6);
        vault.executeDueSchedules(ids);
    }

    function test_ExecuteDueSchedules_SkipsInactive() public {
        uint256 sid = _createWeeklySchedule(4);
        vm.prank(owner);
        vault.cancelSchedule(sid);

        uint256 bobBefore = usdc.balanceOf(bob);
        uint256[] memory ids = new uint256[](1);
        ids[0] = sid;
        vault.executeDueSchedules(ids);
        assertEq(usdc.balanceOf(bob), bobBefore); // no transfer
    }

    function test_ExecuteDueSchedules_SkipsNotDue() public {
        uint64 futureStart = uint64(block.timestamp + 7 days);
        vm.prank(owner);
        uint256 sid = vault.createSchedule(bob, bytes32("lbl"), 100e6, WEEKLY, futureStart, 4);

        uint256 bobBefore = usdc.balanceOf(bob);
        uint256[] memory ids = new uint256[](1);
        ids[0] = sid;
        vault.executeDueSchedules(ids);
        assertEq(usdc.balanceOf(bob), bobBefore); // no transfer yet
    }

    function test_ExecuteDueSchedules_SkipsInsufficientBalance() public {
        // Withdraw everything first
        vm.prank(owner);
        vault.withdraw(INITIAL_DEPOSIT);

        uint256 sid = _createWeeklySchedule(4);
        uint256[] memory ids = new uint256[](1);
        ids[0] = sid;
        vault.executeDueSchedules(ids); // should silently skip
        uint256 bobBal = usdc.balanceOf(bob);
        assertEq(bobBal, 0);
    }

    function test_ExecuteDueSchedules_Revert_BatchTooLarge() public {
        uint256[] memory ids = new uint256[](51);
        vm.expectRevert("batch too large");
        vault.executeDueSchedules(ids);
    }

    function test_ExecuteDueSchedules_MaxBatch_Exact50() public {
        // 50 should succeed (no revert)
        uint256[] memory ids = new uint256[](50);
        vault.executeDueSchedules(ids); // all zero-id, schedule is default (inactive) → skips all
    }

    function test_ExecuteDueSchedules_MultiRun_AcrossWeeks() public {
        uint64 startAt = uint64(block.timestamp);
        vm.prank(owner);
        uint256 sid = vault.createSchedule(bob, bytes32("lbl"), 100e6, WEEKLY, startAt, 3);
        uint256[] memory ids = new uint256[](1);
        ids[0] = sid;

        // Run 1
        vault.executeDueSchedules(ids);
        // Advance one week
        vm.warp(block.timestamp + 7 days);
        // Run 2
        vault.executeDueSchedules(ids);
        // Advance one week
        vm.warp(block.timestamp + 7 days);
        // Run 3 (last)
        vault.executeDueSchedules(ids);

        (, , , , , uint32 runsLeft_, bool active_) = vault.schedules(sid);
        assertEq(runsLeft_, 0);
        assertFalse(active_);
        assertEq(usdc.balanceOf(bob), 3 * 100e6);
    }

    function test_ExecuteDueSchedules_DailyLimitSkips() public {
        // Set a very low daily limit
        vm.prank(owner);
        vault.setDailySpendLimit(50e6);

        uint256 sid = _createWeeklySchedule(4); // 100e6 per run > 50e6 limit

        uint256 bobBefore = usdc.balanceOf(bob);
        uint256[] memory ids = new uint256[](1);
        ids[0] = sid;
        vault.executeDueSchedules(ids); // should skip (over daily limit)
        assertEq(usdc.balanceOf(bob), bobBefore); // no transfer
    }

    // =========================================================================
    // R. FUZZ TESTS
    // =========================================================================

    /// @notice Fuzz: submitted escrow amount never causes vault balance to go negative
    function testFuzz_SubmitIntent_BalanceNeverGoesBelowZero(uint96 amount) public {
        amount = uint96(bound(amount, 1, INITIAL_DEPOSIT));

        // Force escrow lane: charlie is not allowlisted
        vm.prank(alice);
        vault.submitIntent(charlie, bytes32(0), amount, uint64(block.timestamp + 1 days));

        // Vault USDC balance must still be >= amount (locked there)
        assertGe(usdc.balanceOf(address(vault)), amount);
    }

    /// @notice Fuzz: instant lane transfer exactly equals submitted amount
    function testFuzz_SubmitIntent_InstantLane_ExactTransfer(uint96 amount) public {
        amount = uint96(bound(amount, 1, AUTO_MAX));

        uint256 vaultBefore = usdc.balanceOf(address(vault));
        uint256 bobBefore   = usdc.balanceOf(bob);

        vm.prank(alice);
        vault.submitIntent(bob, bytes32(0), amount, uint64(block.timestamp + 1 days));

        assertEq(usdc.balanceOf(address(vault)), vaultBefore - amount);
        assertEq(usdc.balanceOf(bob),            bobBefore   + amount);
    }

    /// @notice Fuzz: deposit → withdraw cycle leaves vault balance unchanged
    function testFuzz_DepositWithdrawCycle(uint96 amount) public {
        amount = uint96(bound(amount, 1, 100_000e6));

        usdc.mint(owner, amount);
        vm.prank(owner);
        usdc.approve(address(vault), amount);

        uint256 vaultBefore = usdc.balanceOf(address(vault));

        vm.prank(owner);
        vault.deposit(amount);

        vm.prank(owner);
        vault.withdraw(amount);

        assertEq(usdc.balanceOf(address(vault)), vaultBefore);
    }

    /// @notice Fuzz: approveIntent transfers exactly the locked amount
    function testFuzz_ApproveIntent_ExactTransfer(uint96 amount) public {
        amount = uint96(bound(amount, 1, uint96(INITIAL_DEPOSIT)));

        uint256 id = _lockIntent(amount);

        // Remove daily limit to avoid interference
        vm.prank(owner);
        vault.setDailySpendLimit(0);

        uint256 charlieBefore = usdc.balanceOf(charlie);
        vm.prank(owner);
        vault.approveIntent(id);
        assertEq(usdc.balanceOf(charlie), charlieBefore + amount);
    }

    // =========================================================================
    // S. INVARIANT TEST
    // =========================================================================
    // (Separate contract below handles the invariant targets)
}

// ─────────────────────────────────────────────────────────────────────────────
// Invariant test contract
// ─────────────────────────────────────────────────────────────────────────────
contract HelmVaultInvariantTest is Test {
    MockERC20    internal usdc;
    HelmVault    internal vault;
    VaultHandler internal handler;

    address internal owner    = makeAddr("inv_owner");
    address internal executor = makeAddr("inv_executor");
    address internal payee    = makeAddr("inv_payee");

    function setUp() public {
        usdc  = new MockERC20("Mock USDC", "mUSDC", 6);
        vault = new HelmVault(owner, address(usdc));

        // Seed vault
        usdc.mint(owner, 100_000e6);
        vm.startPrank(owner);
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(100_000e6);

        // Policy: autoApproveMax = 0 so ALL intents go to escrow lane
        vault.setAutoApproveMax(0);
        vault.setDailySpendLimit(0); // unlimited
        vault.addExecutor(executor);
        // payee NOT allowlisted → guarantees escrow lane
        vm.stopPrank();

        handler = new VaultHandler(vault, usdc, owner, executor, payee);

        // Scope invariant fuzzer to the handler only
        targetContract(address(handler));
    }

    /// @notice Vault USDC balance must never drop below the sum of all Locked intents.
    function invariant_VaultBalanceCoversLockedIntents() public view {
        uint256 vaultBalance = usdc.balanceOf(address(vault));
        uint256 totalLockedAmt = handler.totalLockedAmount();
        assertGe(vaultBalance, totalLockedAmt);
    }
}
