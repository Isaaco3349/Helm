/**
 * Escrow panel — view and manage PaymentIntents.
 * Intent rows are clickable — clicking a Locked row auto-fills the Intent ID field.
 */
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { toast } from 'sonner'
import { VAULT_ABI, INTENT_STATUS_LABELS } from '@/lib/helm-contracts'
import { fmtUsdc, fmtAddress, fmtTs, parseWriteError } from '@/lib/format'
import { ARC_MAINNET_ID } from '@/config'
import { Card, Btn, Input, TxState } from './Card'
import { useState } from 'react'
import { useVaultPolicy } from '@/lib/useVault'
import { useTxEffect } from '@/lib/useTxEffect'

const CHAIN = ARC_MAINNET_ID

const STATUS_COLORS: Record<number, { bg: string; color: string }> = {
  0: { bg: 'rgba(107,99,88,0.15)', color: 'var(--text-muted)' },
  1: { bg: 'rgba(180,120,0,0.15)', color: '#7a5200' },      // Locked — amber
  2: { bg: 'rgba(27,94,64,0.15)', color: 'var(--semantic-success)' },  // Released — green
  3: { bg: 'rgba(107,99,88,0.15)', color: 'var(--text-muted)' },  // Refunded
  4: { bg: 'rgba(138,36,36,0.15)', color: 'var(--semantic-error)' },   // Cancelled
}

export function EscrowPanel({ vaultAddr }: { vaultAddr?: `0x${string}` }) {
  const { address } = useAccount()
  const { nextIntentId } = useVaultPolicy(vaultAddr)
  const total = nextIntentId ? Number(nextIntentId) : 0
  const [selectedId, setSelectedId] = useState('')

  if (!address || !vaultAddr) {
    return <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Connect wallet and create a vault first.</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <ManageIntent vaultAddr={vaultAddr} selectedId={selectedId} setSelectedId={setSelectedId} />
      <Card title={`All intents (${total} total)`}>
        {total === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No intents yet. Have an executor submit one on the Agent desk tab.</p>
        ) : (
          <>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
              Click any <strong>Locked</strong> row to select it for release, approval, or cancellation.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {Array.from({ length: Math.min(total, 20) }, (_, i) => (
                <IntentRow
                  key={i}
                  intentId={BigInt(total - 1 - i)}
                  vaultAddr={vaultAddr}
                  isSelected={selectedId === String(total - 1 - i)}
                  onSelect={(id) => setSelectedId(String(id))}
                />
              ))}
              {total > 20 && (
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Showing latest 20 of {total}.</p>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

function IntentRow({
  intentId,
  vaultAddr,
  isSelected,
  onSelect,
}: {
  intentId: bigint
  vaultAddr: `0x${string}`
  isSelected: boolean
  onSelect: (id: bigint) => void
}) {
  const { data } = useReadContract({
    address: vaultAddr, abi: VAULT_ABI, functionName: 'intents', args: [intentId], chainId: CHAIN,
  })
  if (!data) return null
  const [executor, payee, , , amount, deadline, status] = data as [string, string, `0x${string}`, `0x${string}`, bigint, bigint, number]
  const isLocked = status === 1
  const colors = STATUS_COLORS[status] ?? STATUS_COLORS[0]

  return (
    <div
      onClick={() => isLocked && onSelect(intentId)}
      style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px',
        padding: '10px 12px', borderRadius: '6px', fontSize: '12px',
        background: isSelected ? 'rgba(107,99,88,0.18)' : 'rgba(107,99,88,0.07)',
        border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
        cursor: isLocked ? 'pointer' : 'default',
        transition: 'border 0.15s',
      }}
    >
      <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)', fontWeight: 600 }}>#{String(intentId)}</span>
      <span style={{
        padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
        background: colors.bg, color: colors.color,
      }}>
        {INTENT_STATUS_LABELS[status] ?? 'Unknown'}
      </span>
      <span style={{ color: 'var(--text)' }}>Payee: <span style={{ fontFamily: 'monospace' }}>{fmtAddress(payee)}</span></span>
      <span style={{ color: 'var(--text)', fontWeight: 600 }}>{fmtUsdc(amount)}</span>
      <span style={{ color: 'var(--text-muted)' }}>Deadline: {fmtTs(deadline)}</span>
      <span style={{ color: 'var(--text-muted)' }}>Executor: <span style={{ fontFamily: 'monospace' }}>{fmtAddress(executor)}</span></span>
      {isLocked && !isSelected && (
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--accent)', fontWeight: 600 }}>Click to select</span>
      )}
      {isSelected && (
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--accent)', fontWeight: 600 }}>Selected</span>
      )}
    </div>
  )
}

function ManageIntent({
  vaultAddr,
  selectedId,
  setSelectedId,
}: {
  vaultAddr: `0x${string}`
  selectedId: string
  setSelectedId: (id: string) => void
}) {
  const [proofHash, setProofHash] = useState('')

  const { writeContract: release, data: relHash, isPending: relPending } = useWriteContract()
  const { isLoading: relConfirming, isSuccess: relSuccess, isError: relError, error: relErr } = useWaitForTransactionReceipt({ hash: relHash })
  useTxEffect(relSuccess, () => toast.success('Intent released with proof!'))

  const { writeContract: approve, data: appHash, isPending: appPending } = useWriteContract()
  const { isLoading: appConfirming, isSuccess: appSuccess, isError: appError, error: appErr } = useWaitForTransactionReceipt({ hash: appHash })
  useTxEffect(appSuccess, () => toast.success('Intent approved!'))

  const { writeContract: refund, data: rfHash, isPending: rfPending } = useWriteContract()
  const { isLoading: rfConfirming, isSuccess: rfSuccess, isError: rfError, error: rfErr } = useWaitForTransactionReceipt({ hash: rfHash })
  useTxEffect(rfSuccess, () => toast.success('Intent refunded.'))

  const { writeContract: cancel, data: cnHash, isPending: cnPending } = useWriteContract()
  const { isLoading: cnConfirming, isSuccess: cnSuccess, isError: cnError, error: cnErr } = useWaitForTransactionReceipt({ hash: cnHash })
  useTxEffect(cnSuccess, () => toast.success('Intent cancelled.'))

  const id = selectedId !== '' ? BigInt(selectedId) : undefined

  function mkProofBytes(): `0x${string}` {
    if (!proofHash) return ('0x' + '00'.repeat(32)) as `0x${string}`
    if (proofHash.startsWith('0x') && proofHash.length === 66) return proofHash as `0x${string}`
    const enc = new TextEncoder().encode(proofHash.slice(0, 32))
    const arr = new Uint8Array(32)
    arr.set(enc)
    return ('0x' + Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`
  }

  return (
    <Card title="Manage an intent">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <Input
              label="Intent ID"
              type="number"
              min="0"
              placeholder="Click a Locked row below, or type"
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
            />
            {id !== undefined && (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Intent #{String(id)} selected</span>
            )}
          </div>
          <Input
            label="Proof hash (for Release with proof)"
            placeholder="delivery-confirmed, invoice-123, or 0x…"
            value={proofHash}
            onChange={e => setProofHash(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
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
