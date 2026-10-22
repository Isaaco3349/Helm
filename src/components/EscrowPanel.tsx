/**
 * Escrow panel — view and manage PaymentIntents.
 */
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { toast } from 'sonner'
import { VAULT_ABI } from '@/lib/helm-contracts'
import { fmtUsdc, fmtAddress, fmtTs, parseWriteError } from '@/lib/format'
import { ARC_MAINNET_ID } from '@/config'
import { Card, Btn, Input, TxState, Badge } from './Card'
import { useState } from 'react'
import { useVaultPolicy } from '@/lib/useVault'

const CHAIN = ARC_MAINNET_ID

export function EscrowPanel({ vaultAddr }: { vaultAddr?: `0x${string}` }) {
  const { address } = useAccount()
  const { nextIntentId } = useVaultPolicy(vaultAddr)
  const total = nextIntentId ? Number(nextIntentId) : 0

  if (!address || !vaultAddr) {
    return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Connect wallet and create a vault first.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <ManageIntent vaultAddr={vaultAddr} />
      <Card title={`All intents (${total} total)`}>
        {total === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No intents yet. Have an executor submit one.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {Array.from({ length: Math.min(total, 20) }, (_, i) => (
              <IntentRow key={i} intentId={BigInt(total - 1 - i)} vaultAddr={vaultAddr} />
            ))}
            {total > 20 && (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Showing latest 20 of {total}.</p>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}

function IntentRow({ intentId, vaultAddr }: { intentId: bigint; vaultAddr: `0x${string}` }) {
  const { data } = useReadContract({
    address: vaultAddr,
    abi: VAULT_ABI,
    functionName: 'intents',
    args: [intentId],
    chainId: CHAIN,
  })
  if (!data) return null
  const [executor, payee, , , amount, deadline, status] = data as [string, string, `0x${string}`, `0x${string}`, bigint, bigint, number]
  return (
    <div className="flex flex-wrap items-center gap-2 py-2.5 px-3 rounded text-xs" style={{ background: 'rgba(107,99,88,0.07)', border: '1px solid var(--border)' }}>
      <span className="font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>#{String(intentId)}</span>
      <Badge status={status} />
      <span style={{ color: 'var(--text)' }}>Payee: <span className="font-mono">{fmtAddress(payee)}</span></span>
      <span className="tabular-nums" style={{ color: 'var(--text)' }}>{fmtUsdc(amount)}</span>
      <span style={{ color: 'var(--text-muted)' }}>Deadline: {fmtTs(deadline)}</span>
      <span style={{ color: 'var(--text-muted)' }}>Executor: <span className="font-mono">{fmtAddress(executor)}</span></span>
    </div>
  )
}

function ManageIntent({ vaultAddr }: { vaultAddr: `0x${string}` }) {
  const [intentId, setIntentId] = useState('')
  const [proofHash, setProofHash] = useState('')

  const { writeContract: release, data: relHash, isPending: relPending } = useWriteContract()
  const { isLoading: relConfirming, isSuccess: relSuccess, isError: relError, error: relErr } = useWaitForTransactionReceipt({ hash: relHash })
  if (relSuccess) toast.success('Intent released!')

  const { writeContract: approve, data: appHash, isPending: appPending } = useWriteContract()
  const { isLoading: appConfirming, isSuccess: appSuccess, isError: appError, error: appErr } = useWaitForTransactionReceipt({ hash: appHash })
  if (appSuccess) toast.success('Intent approved!')

  const { writeContract: refund, data: rfHash, isPending: rfPending } = useWriteContract()
  const { isLoading: rfConfirming, isSuccess: rfSuccess, isError: rfError, error: rfErr } = useWaitForTransactionReceipt({ hash: rfHash })
  if (rfSuccess) toast.success('Intent refunded.')

  const { writeContract: cancel, data: cnHash, isPending: cnPending } = useWriteContract()
  const { isLoading: cnConfirming, isSuccess: cnSuccess, isError: cnError, error: cnErr } = useWaitForTransactionReceipt({ hash: cnHash })
  if (cnSuccess) toast.success('Intent cancelled.')

  const id = intentId ? BigInt(intentId) : undefined

  function mkProofBytes(): `0x${string}` {
    if (proofHash.startsWith('0x') && proofHash.length === 66) return proofHash as `0x${string}`
    const enc = new TextEncoder().encode(proofHash.slice(0, 32))
    const arr = new Uint8Array(32)
    arr.set(enc)
    return ('0x' + Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`
  }

  return (
    <Card title="Manage an intent">
      <div className="flex flex-col gap-3">
        <div className="grid md:grid-cols-2 gap-3">
          <Input label="Intent ID" type="number" min="0" placeholder="0" value={intentId} onChange={e => setIntentId(e.target.value)} />
          <Input label="Proof hash (for release)" placeholder="delivery-proof or 0x…" value={proofHash} onChange={e => setProofHash(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn
            onClick={() => release({ address: vaultAddr, abi: VAULT_ABI, functionName: 'releaseIntent', args: [id!, mkProofBytes()], chainId: CHAIN })}
            loading={relPending || relConfirming}
            disabled={id === undefined}
          >
            Release with proof
          </Btn>
          <Btn
            variant="ghost"
            onClick={() => approve({ address: vaultAddr, abi: VAULT_ABI, functionName: 'approveIntent', args: [id!], chainId: CHAIN })}
            loading={appPending || appConfirming}
            disabled={id === undefined}
          >
            Approve (no proof)
          </Btn>
          <Btn
            variant="ghost"
            onClick={() => refund({ address: vaultAddr, abi: VAULT_ABI, functionName: 'refundIntent', args: [id!], chainId: CHAIN })}
            loading={rfPending || rfConfirming}
            disabled={id === undefined}
          >
            Refund (after deadline)
          </Btn>
          <Btn
            variant="danger"
            onClick={() => cancel({ address: vaultAddr, abi: VAULT_ABI, functionName: 'cancelIntent', args: [id!], chainId: CHAIN })}
            loading={cnPending || cnConfirming}
            disabled={id === undefined}
          >
            Cancel
          </Btn>
        </div>
        <TxState hash={relHash} isPending={relPending} isConfirming={relConfirming} isSuccess={relSuccess} isError={relError} errorMsg={parseWriteError(relErr)} chainId={CHAIN} />
        <TxState hash={appHash} isPending={appPending} isConfirming={appConfirming} isSuccess={appSuccess} isError={appError} errorMsg={parseWriteError(appErr)} chainId={CHAIN} />
        <TxState hash={rfHash} isPending={rfPending} isConfirming={rfConfirming} isSuccess={rfSuccess} isError={rfError} errorMsg={parseWriteError(rfErr)} chainId={CHAIN} />
        <TxState hash={cnHash} isPending={cnPending} isConfirming={cnConfirming} isSuccess={cnSuccess} isError={cnError} errorMsg={parseWriteError(cnErr)} chainId={CHAIN} />
      </div>
    </Card>
  )
}
