import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { toast } from 'sonner'
import { useVaultPolicy } from '@/lib/useVault'
import { VAULT_ABI } from '@/lib/helm-contracts'
import { fmtUsdc, parseUsdcInput, parseWriteError } from '@/lib/format'
import { ARC_MAINNET_ID } from '@/config'
import { Card, Btn, Input, TxState } from './Card'
import { useState } from 'react'
import { useTxEffect } from '@/lib/useTxEffect'

const CHAIN = ARC_MAINNET_ID

export function PolicyPanel({ vaultAddr }: { vaultAddr?: `0x${string}` }) {
  const { address } = useAccount()
  const { autoMax, dailyLimit } = useVaultPolicy(vaultAddr)
  const [autoInput, setAutoInput] = useState('')
  const [limitInput, setLimitInput] = useState('')

  const { writeContract: setAuto, data: autoHash, isPending: autoPending } = useWriteContract()
  const { isLoading: autoConfirming, isSuccess: autoSuccess, isError: autoError, error: autoErr } = useWaitForTransactionReceipt({ hash: autoHash })
  useTxEffect(autoSuccess, () => toast.success('Auto-approve cap updated.'))

  const { writeContract: setLimit, data: limitHash, isPending: limitPending } = useWriteContract()
  const { isLoading: limitConfirming, isSuccess: limitSuccess, isError: limitError, error: limitErr } = useWaitForTransactionReceipt({ hash: limitHash })
  useTxEffect(limitSuccess, () => toast.success('Daily limit updated.'))

  if (!address || !vaultAddr) {
    return <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Connect wallet and create a vault first.</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        {/* Auto-approve cap */}
        <Card title="Instant-lane cap">
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
            Payments at or below this amount fire <em>immediately</em> when the payee is allowlisted.
            Current: <strong>{autoMax !== undefined ? fmtUsdc(autoMax) : '—'}</strong>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Input label="New cap (USDC)" type="number" min="0" step="0.01" placeholder="0.10" value={autoInput} onChange={e => setAutoInput(e.target.value)} />
            <Btn
              onClick={() => {
                const raw = parseUsdcInput(autoInput)
                if (!raw) return
                setAuto({ address: vaultAddr, abi: VAULT_ABI, functionName: 'setAutoApproveMax', args: [raw as unknown as number & bigint], chainId: CHAIN })
              }}
              loading={autoPending || autoConfirming}
            >
              Update cap
            </Btn>
            <TxState hash={autoHash} isPending={autoPending} isConfirming={autoConfirming} isSuccess={autoSuccess} isError={autoError} errorMsg={parseWriteError(autoErr)} chainId={CHAIN} />
          </div>
        </Card>

        {/* Daily spend limit */}
        <Card title="Daily spend limit">
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
            Total USDC that can leave the vault in a rolling 24-hour window across all lanes.
            Set to 0 for unlimited. Current: <strong>{dailyLimit !== undefined ? (dailyLimit === 0n ? 'Unlimited' : fmtUsdc(dailyLimit)) : '—'}</strong>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Input label="New limit (USDC, 0 = unlimited)" type="number" min="0" step="0.01" placeholder="5.00" value={limitInput} onChange={e => setLimitInput(e.target.value)} />
            <Btn
              onClick={() => {
                const raw = parseUsdcInput(limitInput)
                if (raw === undefined) return
                setLimit({ address: vaultAddr, abi: VAULT_ABI, functionName: 'setDailySpendLimit', args: [raw as unknown as number & bigint], chainId: CHAIN })
              }}
              loading={limitPending || limitConfirming}
            >
              Update limit
            </Btn>
            <TxState hash={limitHash} isPending={limitPending} isConfirming={limitConfirming} isSuccess={limitSuccess} isError={limitError} errorMsg={parseWriteError(limitErr)} chainId={CHAIN} />
          </div>
        </Card>
      </div>

      {/* Payee allowlist */}
      <AllowlistManager vaultAddr={vaultAddr} />
    </div>
  )
}

function AllowlistManager({ vaultAddr }: { vaultAddr: `0x${string}` }) {
  const [payeeInput, setPayeeInput] = useState('')
  const [removeInput, setRemoveInput] = useState('')

  const { writeContract: addPayee, data: addHash, isPending: addPending } = useWriteContract()
  const { isLoading: addConfirming, isSuccess: addSuccess, isError: addError, error: addErr } = useWaitForTransactionReceipt({ hash: addHash })
  useTxEffect(addSuccess, () => { setPayeeInput(''); toast.success('Payee added to allowlist.') })

  const { writeContract: rmPayee, data: rmHash, isPending: rmPending } = useWriteContract()
  const { isLoading: rmConfirming, isSuccess: rmSuccess, isError: rmError, error: rmErr } = useWaitForTransactionReceipt({ hash: rmHash })
  useTxEffect(rmSuccess, () => { setRemoveInput(''); toast.success('Payee removed from allowlist.') })

  return (
    <Card title="Payee allowlist">
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
        Only allowlisted payees are eligible for the instant lane. Any address can receive escrow-lane payments.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Input label="Add payee address" placeholder="0x…" value={payeeInput} onChange={e => setPayeeInput(e.target.value)} />
          <Btn onClick={() => addPayee({ address: vaultAddr, abi: VAULT_ABI, functionName: 'addPayee', args: [payeeInput as `0x${string}`], chainId: CHAIN })} loading={addPending || addConfirming}>
            Add payee
          </Btn>
          <TxState hash={addHash} isPending={addPending} isConfirming={addConfirming} isSuccess={addSuccess} isError={addError} errorMsg={parseWriteError(addErr)} chainId={CHAIN} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Input label="Remove payee address" placeholder="0x…" value={removeInput} onChange={e => setRemoveInput(e.target.value)} />
          <Btn variant="ghost" onClick={() => rmPayee({ address: vaultAddr, abi: VAULT_ABI, functionName: 'removePayee', args: [removeInput as `0x${string}`], chainId: CHAIN })} loading={rmPending || rmConfirming}>
            Remove payee
          </Btn>
          <TxState hash={rmHash} isPending={rmPending} isConfirming={rmConfirming} isSuccess={rmSuccess} isError={rmError} errorMsg={parseWriteError(rmErr)} chainId={CHAIN} />
        </div>
      </div>
    </Card>
  )
}
