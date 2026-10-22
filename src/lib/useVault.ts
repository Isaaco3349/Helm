/**
 * Central hook: resolves the connected owner's vault address from the factory,
 * reads vault state, and exposes write helpers.
 */
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi } from 'viem'
import { FACTORY_ABI, VAULT_ABI, FACTORY_ADDRESS } from './helm-contracts'
import { ARC_MAINNET_ID } from '@/config'
import { getUsdc } from '@/onchain-facts'

const CHAIN = ARC_MAINNET_ID

export function useVaultAddress() {
  const { address } = useAccount()
  const { data: vaultAddr, isLoading, refetch } = useReadContract({
    address: FACTORY_ADDRESS || undefined,
    abi: FACTORY_ABI,
    functionName: 'getVault',
    args: [address as `0x${string}`],
    chainId: CHAIN,
    query: { enabled: !!FACTORY_ADDRESS && !!address },
  })
  const resolved = vaultAddr && vaultAddr !== '0x0000000000000000000000000000000000000000' ? vaultAddr : undefined
  return { vaultAddr: resolved, isLoading, refetch }
}

export function useVaultBalance(vaultAddr: `0x${string}` | undefined) {
  const usdcFact = getUsdc(CHAIN)
  const usdcAddress = usdcFact?.address as `0x${string}` | undefined
  const { data, isLoading, refetch } = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [vaultAddr as `0x${string}`],
    chainId: CHAIN,
    query: { enabled: !!vaultAddr && !!usdcAddress },
  })
  return { balance: data, isLoading, refetch }
}

export function useWalletUsdcBalance(address: `0x${string}` | undefined) {
  const usdcFact = getUsdc(CHAIN)
  const usdcAddress = usdcFact?.address as `0x${string}` | undefined
  const { data, isLoading, refetch } = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
    chainId: CHAIN,
    query: { enabled: !!address && !!usdcAddress },
  })
  return { balance: data, isLoading, refetch }
}

export function useVaultPolicy(vaultAddr: `0x${string}` | undefined) {
  const { data: autoMax } = useReadContract({ address: vaultAddr, abi: VAULT_ABI, functionName: 'autoApproveMax', chainId: CHAIN, query: { enabled: !!vaultAddr } })
  const { data: dailyLimit } = useReadContract({ address: vaultAddr, abi: VAULT_ABI, functionName: 'dailySpendLimit', chainId: CHAIN, query: { enabled: !!vaultAddr } })
  const { data: spentToday } = useReadContract({ address: vaultAddr, abi: VAULT_ABI, functionName: 'spentToday', chainId: CHAIN, query: { enabled: !!vaultAddr } })
  const { data: nextIntentId } = useReadContract({ address: vaultAddr, abi: VAULT_ABI, functionName: 'nextIntentId', chainId: CHAIN, query: { enabled: !!vaultAddr } })
  const { data: nextScheduleId } = useReadContract({ address: vaultAddr, abi: VAULT_ABI, functionName: 'nextScheduleId', chainId: CHAIN, query: { enabled: !!vaultAddr } })
  return {
    autoMax: autoMax,
    dailyLimit: dailyLimit,
    spentToday: spentToday,
    nextIntentId: nextIntentId,
    nextScheduleId: nextScheduleId,
  }
}

export function useIntent(vaultAddr: `0x${string}` | undefined, intentId: bigint | undefined) {
  const { data, isLoading, refetch } = useReadContract({
    address: vaultAddr,
    abi: VAULT_ABI,
    functionName: 'intents',
    args: [intentId ?? 0n],
    chainId: CHAIN,
    query: { enabled: !!vaultAddr && intentId !== undefined },
  })
  return { intent: data as readonly [string, string, `0x${string}`, `0x${string}`, bigint, bigint, number] | undefined, isLoading, refetch }
}

export function useSchedule(vaultAddr: `0x${string}` | undefined, scheduleId: bigint | undefined) {
  const { data, isLoading, refetch } = useReadContract({
    address: vaultAddr,
    abi: VAULT_ABI,
    functionName: 'schedules',
    args: [scheduleId ?? 0n],
    chainId: CHAIN,
    query: { enabled: !!vaultAddr && scheduleId !== undefined },
  })
  return { schedule: data as readonly [string, `0x${string}`, bigint, number, bigint, number, boolean] | undefined, isLoading, refetch }
}

/** Generic write hook for vault calls */
export function useVaultWrite() {
  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  return { writeContract, hash, isPending, isConfirming, isSuccess, isError, error, reset }
}

/** Generic write hook for ERC20 approve */
export function useErc20Approve() {
  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  return { writeContract, hash, isPending, isConfirming, isSuccess, isError, error, reset }
}

/** Check ERC20 allowance */
export function useUsdcAllowance(owner: `0x${string}` | undefined, spender: `0x${string}` | undefined) {
  const usdcFact = getUsdc(CHAIN)
  const usdcAddress = usdcFact?.address as `0x${string}` | undefined
  const { data, refetch } = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner as `0x${string}`, spender as `0x${string}`],
    chainId: CHAIN,
    query: { enabled: !!owner && !!spender && !!usdcAddress },
  })
  return { allowance: data, refetch }
}
