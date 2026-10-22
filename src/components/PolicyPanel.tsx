import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { toast } from 'sonner'
import { useVaultPolicy } from '@/lib/useVault'
import { VAULT_ABI } from '@/lib/helm-contracts'
import { fmtUsdc, parseUsdcInput, parseWriteError } from '@/lib/format'
import { ARC_MAINNET_ID } from '@/config'
import { Card, Btn, Input, TxState } from './Card'
import { useState } from 'react'

const CHAIN = ARC_MAINNET_ID

export function PolicyPanel({ vaultAddr }: { vaultAddr?: `0x${string}` }) {
  const { address } = useAccount()
  const { autoMax, dailyLimit } = useVaultPolicy(vaultAddr)
  const [autoInput, setAutoInput] = useState('')
  const [limitInput, setLimitInput] = useState('')

  const { writeContract: setAuto, data: autoHash, isPending: autoPending } = useWriteContract()
  const { isLoading: autoConfirming, isSuccess: autoSuccess, isError: autoError, error: autoErr } = useWaitForTransactionReceipt({ hash: autoHash })
  if (autoSuccess) toast.success('Auto-approve cap updated.')

  const { writeContract: setLimit, data: limitHash, isPending: limitPending } = useWriteContract()
  const { isLoading: limitConfirming, isSuccess: limitSuccess, isError: limitError, error: limitErr } = useWaitForTransactionReceipt({ hash: limitHash })
  if (limitSuccess) toast.success('Daily limit updated.')

  if (!address || !vaultAddr) {
    return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Connect wallet and create a vault first.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid md:grid-cols-2 gap-4">
        {/* Auto-approve cap */}
        <Card title="Instant-lane cap">
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            Payments at or below this amount are paid <em>immediately</em> when the payee is on the allowlist.
            Current: <strong>{autoMax !== undefined ? fmtUsdc(autoMax) : '—'}</strong>
          </p>
          <div className="flex flex-col gap-2">
            <Input label="New cap (USDC)" type="number" min="0" step="0.01" placeholder="0.10" value={autoInput} onChange={e => setAutoInput(e.target.value)} />
            <Btn
              onClick={() => {
                const raw = parseUsdcInput(autoInput)
                setAuto({ address: vaultAddr, abi: VAULT_ABI, functionName: 'setAutoApproveMax', args: [BigInt(raw) as unknown as number & bigint], chainId: CHAIN })
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
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            Total USDC that can leave the vault in any rolling 24-hour window (instant + escrow + schedule lanes).
            Set to 0 for unlimited. Current: <strong>{dailyLimit !== undefined ? (dailyLimit === 0n ? 'Unlimited' : fmtUsdc(dailyLimit)) : '—'}</strong>
          </p>
          <div className="flex flex-col gap-2">
            <Input label="New limit (USDC, 0 = unlimited)" type="number" min="0" step="0.01" placeholder="5.00" value={limitInput} onChange={e => setLimitInput(e.target.value)} />
            <Btn
              onClick={() => {
                const raw = parseUsdcInput(limitInput)
                setLimit({ address: vaultAddr, abi: VAULT_ABI, functionName: 'setDailySpendLimit', args: [BigInt(raw) as unknown as number & bigint], chainId: CHAIN })
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
  if (addSuccess) { setPayeeInput(''); toast.success('Payee added to allowlist.') }

  const { writeContract: rmPayee, data: rmHash, isPending: rmPending } = useWriteContract()
  const { isLoading: rmConfirming, isSuccess: rmSuccess, isError: rmError, error: rmErr } = useWaitForTransactionReceipt({ hash: rmHash })
  if (rmSuccess) { setRemoveInput(''); toast.success('Payee removed from allowlist.') }

  return (
    <Card title="Payee allowlist">
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        Only allowlisted payees are eligible for the instant lane. All addresses can receive escrow-lane payments.
      </p>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Input label="Add payee address" placeholder="0x…" value={payeeInput} onChange={e => setPayeeInput(e.target.value)} />
          <Btn onClick={() => addPayee({ address: vaultAddr, abi: VAULT_ABI, functionName: 'addPayee', args: [payeeInput as `0x${string}`], chainId: ARC_MAINNET_ID })} loading={addPending || addConfirming}>
            Add payee
          </Btn>
          <TxState hash={addHash} isPending={addPending} isConfirming={addConfirming} isSuccess={addSuccess} isError={addError} errorMsg={parseWriteError(addErr)} chainId={ARC_MAINNET_ID} />
        </div>
        <div className="flex flex-col gap-2">
          <Input label="Remove payee address" placeholder="0x…" value={removeInput} onChange={e => setRemoveInput(e.target.value)} />
          <Btn variant="ghost" onClick={() => rmPayee({ address: vaultAddr, abi: VAULT_ABI, functionName: 'removePayee', args: [removeInput as `0x${string}`], chainId: ARC_MAINNET_ID })} loading={rmPending || rmConfirming}>
            Remove payee
          </Btn>
          <TxState hash={rmHash} isPending={rmPending} isConfirming={rmConfirming} isSuccess={rmSuccess} isError={rmError} errorMsg={parseWriteError(rmErr)} chainId={ARC_MAINNET_ID} />
        </div>
      </div>
    </Card>
  )
}
