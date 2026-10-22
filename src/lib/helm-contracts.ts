/**
 * Helm contract ABIs and address helpers.
 * After deploy, the factory address is written to .env as VITE_HELM_FACTORY_ADDRESS.
 */
import { getUsdc } from '@/onchain-facts'

// ── Arc mainnet USDC ──────────────────────────────────────────────────────────
// Source: https://docs.arc.io/arc/references/contract-addresses
// USDC is a fixed native predeploy at the same address on every Arc network.
export const ARC_MAINNET_USDC = '0x3600000000000000000000000000000000000000' as const

export function getVaultUsdc(chainId: number): string {
  const fact = getUsdc(chainId)
  return fact?.address ?? ARC_MAINNET_USDC
}

// ── Factory ABI ───────────────────────────────────────────────────────────────
export const FACTORY_ABI = [
  {
    type: 'constructor',
    inputs: [{ name: '_usdc', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'createVault',
    inputs: [],
    outputs: [{ name: 'vault', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getVault',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAllVaults',
    inputs: [],
    outputs: [{ type: 'address[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'usdc',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'VaultCreated',
    inputs: [
      { name: 'vault', type: 'address', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
    ],
  },
] as const

// ── Vault ABI ─────────────────────────────────────────────────────────────────
export const VAULT_ABI = [
  // State reads
  { type: 'function', name: 'owner', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'usdc', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'autoApproveMax', inputs: [], outputs: [{ type: 'uint96' }], stateMutability: 'view' },
  { type: 'function', name: 'dailySpendLimit', inputs: [], outputs: [{ type: 'uint96' }], stateMutability: 'view' },
  { type: 'function', name: 'spentToday', inputs: [], outputs: [{ type: 'uint96' }], stateMutability: 'view' },
  { type: 'function', name: 'dayBucket', inputs: [], outputs: [{ type: 'uint64' }], stateMutability: 'view' },
  { type: 'function', name: 'nextIntentId', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'nextScheduleId', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'executors', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'allowlistedPayees', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'MAX_BATCH', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  {
    type: 'function', name: 'intents',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [
      { name: 'executor', type: 'address' },
      { name: 'payee', type: 'address' },
      { name: 'serviceRef', type: 'bytes32' },
      { name: 'proofHash', type: 'bytes32' },
      { name: 'amount', type: 'uint96' },
      { name: 'deadline', type: 'uint64' },
      { name: 'status', type: 'uint8' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'schedules',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [
      { name: 'payee', type: 'address' },
      { name: 'labelRef', type: 'bytes32' },
      { name: 'amount', type: 'uint96' },
      { name: 'intervalSeconds', type: 'uint32' },
      { name: 'nextRunAt', type: 'uint64' },
      { name: 'runsRemaining', type: 'uint32' },
      { name: 'active', type: 'bool' },
    ],
    stateMutability: 'view',
  },
  // Writes
  { type: 'function', name: 'deposit', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'withdraw', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'addExecutor', inputs: [{ name: 'executor', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'removeExecutor', inputs: [{ name: 'executor', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'addPayee', inputs: [{ name: 'payee', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'removePayee', inputs: [{ name: 'payee', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'setAutoApproveMax', inputs: [{ name: 'amount', type: 'uint96' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'setDailySpendLimit', inputs: [{ name: 'limit', type: 'uint96' }], outputs: [], stateMutability: 'nonpayable' },
  {
    type: 'function', name: 'submitIntent',
    inputs: [
      { name: 'payee', type: 'address' },
      { name: 'serviceRef', type: 'bytes32' },
      { name: 'amount', type: 'uint96' },
      { name: 'deadline', type: 'uint64' },
    ],
    outputs: [{ name: 'intentId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  { type: 'function', name: 'approveIntent', inputs: [{ name: 'intentId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'releaseIntent', inputs: [{ name: 'intentId', type: 'uint256' }, { name: 'proofHash', type: 'bytes32' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'refundIntent', inputs: [{ name: 'intentId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'cancelIntent', inputs: [{ name: 'intentId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  {
    type: 'function', name: 'createSchedule',
    inputs: [
      { name: 'payee', type: 'address' },
      { name: 'labelRef', type: 'bytes32' },
      { name: 'amount', type: 'uint96' },
      { name: 'intervalSeconds', type: 'uint32' },
      { name: 'startAt', type: 'uint64' },
      { name: 'runsRemaining', type: 'uint32' },
    ],
    outputs: [{ name: 'scheduleId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  { type: 'function', name: 'cancelSchedule', inputs: [{ name: 'scheduleId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'executeDueSchedules', inputs: [{ name: 'scheduleIds', type: 'uint256[]' }], outputs: [], stateMutability: 'nonpayable' },
  // Events
  { type: 'event', name: 'Deposited', inputs: [{ name: 'from', type: 'address', indexed: true }, { name: 'amount', type: 'uint256' }] },
  { type: 'event', name: 'Withdrawn', inputs: [{ name: 'to', type: 'address', indexed: true }, { name: 'amount', type: 'uint256' }] },
  { type: 'event', name: 'ExecutorAdded', inputs: [{ name: 'executor', type: 'address', indexed: true }] },
  { type: 'event', name: 'ExecutorRemoved', inputs: [{ name: 'executor', type: 'address', indexed: true }] },
  { type: 'event', name: 'PayeeAdded', inputs: [{ name: 'payee', type: 'address', indexed: true }] },
  { type: 'event', name: 'PayeeRemoved', inputs: [{ name: 'payee', type: 'address', indexed: true }] },
  { type: 'event', name: 'PolicyUpdated', inputs: [{ name: 'autoApproveMax', type: 'uint96' }, { name: 'dailySpendLimit', type: 'uint96' }] },
  { type: 'event', name: 'IntentInstantPaid', inputs: [{ name: 'intentId', type: 'uint256', indexed: true }, { name: 'executor', type: 'address', indexed: true }, { name: 'payee', type: 'address', indexed: true }, { name: 'amount', type: 'uint96' }, { name: 'serviceRef', type: 'bytes32' }] },
  { type: 'event', name: 'IntentLocked', inputs: [{ name: 'intentId', type: 'uint256', indexed: true }, { name: 'executor', type: 'address', indexed: true }, { name: 'payee', type: 'address', indexed: true }, { name: 'amount', type: 'uint96' }, { name: 'deadline', type: 'uint64' }] },
  { type: 'event', name: 'IntentReleased', inputs: [{ name: 'intentId', type: 'uint256', indexed: true }, { name: 'proofHash', type: 'bytes32' }] },
  { type: 'event', name: 'IntentRefunded', inputs: [{ name: 'intentId', type: 'uint256', indexed: true }] },
  { type: 'event', name: 'IntentCancelled', inputs: [{ name: 'intentId', type: 'uint256', indexed: true }] },
  { type: 'event', name: 'ScheduleCreated', inputs: [{ name: 'scheduleId', type: 'uint256', indexed: true }, { name: 'payee', type: 'address', indexed: true }, { name: 'amount', type: 'uint96' }, { name: 'intervalSeconds', type: 'uint32' }] },
  { type: 'event', name: 'ScheduleCancelled', inputs: [{ name: 'scheduleId', type: 'uint256', indexed: true }] },
  { type: 'event', name: 'ScheduleExecuted', inputs: [{ name: 'scheduleId', type: 'uint256', indexed: true }, { name: 'payee', type: 'address', indexed: true }, { name: 'amount', type: 'uint96' }] },
] as const

// Intent status enum
export enum IntentStatus {
  None = 0,
  Locked = 1,
  Released = 2,
  Refunded = 3,
  Cancelled = 4,
}

export const INTENT_STATUS_LABELS: Record<number, string> = {
  0: 'None',
  1: 'Locked',
  2: 'Released',
  3: 'Refunded',
  4: 'Cancelled',
}

export const FACTORY_ADDRESS = (import.meta.env.VITE_HELM_FACTORY_ADDRESS ?? '') as `0x${string}`
