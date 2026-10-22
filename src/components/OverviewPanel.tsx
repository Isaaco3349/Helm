import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { erc20Abi } from 'viem'
import { toast } from 'sonner'
import { useVaultBalance, useWalletUsdcBalance, useVaultPolicy, useUsdcAllowance } from '@/lib/useVault'
import { FACTORY_ABI, FACTORY_ADDRESS } from '@/lib/helm-contracts'
import { fmtUsdc, parseUsdcInput, parseWriteError } from '@/lib/format'
import { getUsdc } from '@/onchain-facts'
import { ARC_MAINNET_ID } from '@/config'
import { Card, Stat, Btn, Input, TxState } from './Card'
import { useState } from 'react'

const CHAIN = ARC_MAINNET_ID

interface OverviewPanelProps {
  vaultAddr?: `0x${string}`
  onVaultCreated: () => void
}

export function OverviewPanel({ vaultAddr, onVaultCreated }: OverviewPanelProps) {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const { balance: vaultBal, refetch: refetchVaultBal } = useVaultBalance(vaultAddr)
  const { balance: walletBal } = useWalletUsdcBalance(address)
  const { autoMax, dailyLimit, spentToday, nextIntentId, nextScheduleId } = useVaultPolicy(vaultAddr)
  const usdcFact = getUsdc(CHAIN)
  const usdcAddress = usdcFact?.address as `0x${string}` | undefined
  const isArc = chainId === CHAIN

  // Create vault
  const { writeContract: createVault, data: cvHash, isPending: cvPending } = useWriteContract()
  const { isLoading: cvConfirming, isSuccess: cvSuccess } = useWaitForTransactionReceipt({ hash: cvHash })
  if (cvSuccess) { onVaultCreated() }

  // Deposit flow: approve then deposit
  const [depositAmt, setDepositAmt] = useState('')
  const { allowance, refetch: refetchAllowance } = useUsdcAllowance(address, vaultAddr)
  const { writeContract: approve, data: approveHash, isPending: approvePending } = useWriteContract()
  const { isLoading: approveConfirming, isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash })
  const { writeContract: deposit, data: depositHash, isPending: depositPending } = useWriteContract()
  const { isLoading: depositConfirming, isSuccess: depositSuccess, isError: depositError, error: depositErr } = useWaitForTransactionReceipt({ hash: depositHash })
  if (depositSuccess) { void refetchVaultBal(); void refetchAllowance(); setDepositAmt(''); toast.success('Deposited!') }

  // Withdraw flow
  const [withdrawAmt, setWithdrawAmt] = useState('')
  const { writeContract: withdraw, data: withdrawHash, isPending: withdrawPending } = useWriteContract()
  const { isLoading: withdrawConfirming, isSuccess: withdrawSuccess, isError: withdrawError, error: withdrawErr } = useWaitForTransactionReceipt({ hash: withdrawHash })
  if (withdrawSuccess) { void refetchVaultBal(); setWithdrawAmt(''); toast.success('Withdrawn!') }

  function handleDeposit() {
    if (!vaultAddr || !usdcAddress || !address) return
    const raw = parseUsdcInput(depositAmt)
    if (!raw) return
    if ((allowance ?? 0n) < raw) {
      approve({ address: usdcAddress, abi: erc20Abi, functionName: 'approve', args: [vaultAddr, raw], chainId: CHAIN })
    } else {
      deposit({ address: vaultAddr, abi: [
        { type: 'function', name: 'deposit', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' }
      ] as const, functionName: 'deposit', args: [raw], chainId: CHAIN })
    }
  }

  if (approveSuccess) {
    const raw = parseUsdcInput(depositAmt)
    if (raw && vaultAddr) {
      deposit({ address: vaultAddr, abi: [
        { type: 'function', name: 'deposit', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' }
      ] as const, functionName: 'deposit', args: [raw], chainId: CHAIN })
    }
  }

  function handleWithdraw() {
    if (!vaultAddr) return
    const raw = parseUsdcInput(withdrawAmt)
    if (!raw) return
    withdraw({ address: vaultAddr, abi: [
      { type: 'function', name: 'withdraw', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' }
    ] as const, functionName: 'withdraw', args: [raw], chainId: CHAIN })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* Not-deployed banner (non-blocking) */}
      {!FACTORY_ADDRESS && (
        <div style={{
          padding: '10px 14px',
          borderRadius: '8px',
          background: 'rgba(138,36,36,0.09)',
          border: '1px solid var(--semantic-error)',
          color: 'var(--semantic-error)',
          fontSize: '12px',
        }}>
          <strong>Contracts pending deployment.</strong> Set <code>VITE_HELM_FACTORY_ADDRESS</code> in .env after deploying.
        </div>
      )}

      {/* Not connected */}
      {!address && (
        <Card>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', padding: '24px 0' }}>
            Connect your wallet to get started.
          </p>
        </Card>
      )}

      {/* Wrong network */}
      {address && !isArc && (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '24px 0' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Helm runs on Arc mainnet.</p>
            <Btn onClick={() => switchChain({ chainId: CHAIN })}>Switch to Arc mainnet</Btn>
          </div>
        </Card>
      )}

      {/* Balances row */}
      {address && isArc && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
          <Card><Stat label="Vault USDC" value={fmtUsdc(vaultBal)} sub="deposited" /></Card>
          <Card><Stat label="Wallet USDC" value={fmtUsdc(walletBal)} sub="your wallet" /></Card>
          <Card><Stat label="Intents" value={nextIntentId !== undefined ? String(nextIntentId) : '—'} sub="total" /></Card>
          <Card><Stat label="Schedules" value={nextScheduleId !== undefined ? String(nextScheduleId) : '—'} sub="total" /></Card>
        </div>
      )}

      {/* Policy row */}
      {address && isArc && vaultAddr && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
          <Card><Stat label="Auto-approve cap" value={autoMax !== undefined ? fmtUsdc(autoMax) : '—'} sub="per tx" /></Card>
          <Card><Stat label="Daily limit" value={dailyLimit !== undefined ? (dailyLimit === 0n ? 'Unlimited' : fmtUsdc(dailyLimit)) : '—'} /></Card>
          <Card><Stat label="Spent today" value={spentToday !== undefined ? fmtUsdc(spentToday) : '—'} /></Card>
        </div>
      )}

      {/* Create vault CTA */}
      {address && isArc && FACTORY_ADDRESS && !vaultAddr && (
        <Card title="Your Vault">
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '14px' }}>
            You don't have a Helm vault yet. Create one to start managing agent payments.
          </p>
          <Btn
            onClick={() => createVault({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'createVault', chainId: CHAIN })}
            loading={cvPending || cvConfirming}
          >
            Create Vault
          </Btn>
          <TxState hash={cvHash} isPending={cvPending} isConfirming={cvConfirming} isSuccess={cvSuccess} isError={false} chainId={CHAIN} />
        </Card>
      )}

      {/* Deposit & Withdraw */}
      {address && isArc && vaultAddr && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
          <Card title="Deposit USDC">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <Input label="Amount (USDC)" type="number" min="0" step="0.01" placeholder="1.00" value={depositAmt} onChange={e => setDepositAmt(e.target.value)} />
              <Btn onClick={handleDeposit} loading={approvePending || approveConfirming || depositPending || depositConfirming}>
                {(allowance ?? 0n) < parseUsdcInput(depositAmt) && depositAmt ? 'Approve & Deposit' : 'Deposit'}
              </Btn>
              <TxState hash={depositHash} isPending={depositPending} isConfirming={depositConfirming} isSuccess={depositSuccess} isError={depositError} errorMsg={parseWriteError(depositErr)} chainId={CHAIN} />
            </div>
          </Card>
          <Card title="Withdraw USDC">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <Input label="Amount (USDC)" type="number" min="0" step="0.01" placeholder="0.50" value={withdrawAmt} onChange={e => setWithdrawAmt(e.target.value)} />
              <Btn variant="ghost" onClick={handleWithdraw} loading={withdrawPending || withdrawConfirming}>
                Withdraw
              </Btn>
              <TxState hash={withdrawHash} isPending={withdrawPending} isConfirming={withdrawConfirming} isSuccess={withdrawSuccess} isError={withdrawError} errorMsg={parseWriteError(withdrawErr)} chainId={CHAIN} />
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
