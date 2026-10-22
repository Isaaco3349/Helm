/**
 * Schedules panel — create, view, cancel, and execute due scheduled payments.
 */
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { toast } from 'sonner'
import { VAULT_ABI } from '@/lib/helm-contracts'
import { fmtUsdc, fmtAddress, fmtTs, fmtInterval, parseUsdcInput, parseWriteError } from '@/lib/format'
import { ARC_MAINNET_ID } from '@/config'
import { Card, Btn, Input, TxState } from './Card'
import { useState } from 'react'
import { useVaultPolicy } from '@/lib/useVault'

const CHAIN = ARC_MAINNET_ID
const WEEKLY = 7 * 24 * 3600   // 604800
const MONTHLY = 30 * 24 * 3600  // 2592000

export function SchedulesPanel({ vaultAddr }: { vaultAddr?: `0x${string}` }) {
  const { address } = useAccount()
  const { nextScheduleId } = useVaultPolicy(vaultAddr)
  const total = nextScheduleId ? Number(nextScheduleId) : 0

  if (!address || !vaultAddr) {
    return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Connect wallet and create a vault first.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <CreateScheduleForm vaultAddr={vaultAddr} />
      <ExecuteSchedulesForm vaultAddr={vaultAddr} total={total} />
      <Card title={`All schedules (${total} total)`}>
        {total === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No schedules yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {Array.from({ length: Math.min(total, 20) }, (_, i) => (
              <ScheduleRow key={i} scheduleId={BigInt(total - 1 - i)} vaultAddr={vaultAddr} />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function ScheduleRow({ scheduleId, vaultAddr }: { scheduleId: bigint; vaultAddr: `0x${string}` }) {
  const { data } = useReadContract({
    address: vaultAddr,
    abi: VAULT_ABI,
    functionName: 'schedules',
    args: [scheduleId],
    chainId: CHAIN,
  })
  if (!data) return null
  const [payee, , amount, intervalSeconds, nextRunAt, runsRemaining, active] = data as [string, `0x${string}`, bigint, number, bigint, number, boolean]
  return (
    <div className="flex flex-wrap items-center gap-2 py-2.5 px-3 rounded text-xs" style={{ background: 'rgba(107,99,88,0.07)', border: '1px solid var(--border)' }}>
      <span className="font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>#{String(scheduleId)}</span>
      <span className="px-1.5 py-0.5 rounded-full text-xs font-medium" style={{
        background: active ? 'rgba(27,94,64,0.15)' : 'rgba(107,99,88,0.15)',
        color: active ? 'var(--semantic-success)' : 'var(--text-muted)',
      }}>
        {active ? 'Active' : 'Inactive'}
      </span>
      <span style={{ color: 'var(--text)' }}>Payee: <span className="font-mono">{fmtAddress(payee)}</span></span>
      <span className="tabular-nums">{fmtUsdc(amount)}</span>
      <span style={{ color: 'var(--text-muted)' }}>{fmtInterval(intervalSeconds)}</span>
      <span style={{ color: 'var(--text-muted)' }}>Next: {fmtTs(nextRunAt)}</span>
      <span style={{ color: 'var(--text-muted)' }}>Runs left: {runsRemaining === 0 ? 'Unlimited' : runsRemaining}</span>
    </div>
  )
}

function CreateScheduleForm({ vaultAddr }: { vaultAddr: `0x${string}` }) {
  const [payee, setPayee] = useState('')
  const [amount, setAmount] = useState('')
  const [label, setLabel] = useState('')
  const [interval, setInterval] = useState<'weekly' | 'monthly'>('monthly')
  const [runsRemaining, setRunsRemaining] = useState('0')
  const [startOffset, setStartOffset] = useState('0')

  const { writeContract, data: hash, isPending, isError, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  if (isSuccess) { setPayee(''); setAmount(''); setLabel(''); toast.success('Schedule created!') }

  function submit() {
    const raw = parseUsdcInput(amount)
    if (!payee || !raw) return
    const intervalSecs = interval === 'weekly' ? WEEKLY : MONTHLY
    const startAt = BigInt(Math.floor(Date.now() / 1000) + Number(startOffset) * 86400)
    const enc = new TextEncoder().encode(label.slice(0, 32))
    const arr = new Uint8Array(32)
    arr.set(enc)
    const labelBytes = ('0x' + Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`
    writeContract({
      address: vaultAddr,
      abi: VAULT_ABI,
      functionName: 'createSchedule',
      args: [
        payee as `0x${string}`,
        labelBytes,
        BigInt(raw) as unknown as number & bigint,
        intervalSecs as unknown as number & bigint,
        BigInt(startAt) as unknown as number & bigint,
        Number(runsRemaining) as unknown as number & bigint,
      ],
      chainId: CHAIN,
    })
  }

  return (
    <Card title="Create schedule">
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        Monthly intervals use a 30-day approximation (2,592,000 seconds).
      </p>
      <div className="grid md:grid-cols-2 gap-3">
        <Input label="Payee address" placeholder="0x…" value={payee} onChange={e => setPayee(e.target.value)} />
        <Input label="Amount per run (USDC)" type="number" min="0" step="0.01" placeholder="100.00" value={amount} onChange={e => setAmount(e.target.value)} />
        <Input label="Label / reference" placeholder="monthly-retainer" value={label} onChange={e => setLabel(e.target.value)} />
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Interval</label>
          <select
            value={interval}
            onChange={e => setInterval(e.target.value as 'weekly' | 'monthly')}
            className="px-3 py-2 rounded text-sm"
            style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            <option value="weekly">Weekly (7 days)</option>
            <option value="monthly">Monthly (30 days)</option>
          </select>
        </div>
        <Input label="Start (days from now)" type="number" min="0" value={startOffset} onChange={e => setStartOffset(e.target.value)} />
        <Input label="Max runs (0 = unlimited)" type="number" min="0" value={runsRemaining} onChange={e => setRunsRemaining(e.target.value)} />
      </div>
      <div className="mt-3">
        <Btn onClick={submit} loading={isPending || isConfirming}>Create schedule</Btn>
      </div>
      <TxState hash={hash} isPending={isPending} isConfirming={isConfirming} isSuccess={isSuccess} isError={isError} errorMsg={parseWriteError(error)} chainId={CHAIN} />
    </Card>
  )
}

function ExecuteSchedulesForm({ vaultAddr, total }: { vaultAddr: `0x${string}`; total: number }) {
  const [idsInput, setIdsInput] = useState('')

  const { writeContract, data: hash, isPending, isError, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  if (isSuccess) toast.success('Due schedules executed!')

  function execute() {
    const ids = idsInput.split(',').map(s => s.trim()).filter(Boolean).map(s => BigInt(s))
    if (ids.length === 0) {
      // Execute all (up to MAX_BATCH=50)
      const all = Array.from({ length: Math.min(total, 50) }, (_, i) => BigInt(i))
      writeContract({ address: vaultAddr, abi: VAULT_ABI, functionName: 'executeDueSchedules', args: [all], chainId: CHAIN })
    } else {
      writeContract({ address: vaultAddr, abi: VAULT_ABI, functionName: 'executeDueSchedules', args: [ids], chainId: CHAIN })
    }
  }

  return (
    <Card title="Execute due schedules">
      <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
        Any wallet can call this. Leave IDs blank to run all (up to 50). Schedules that are not yet due, inactive, or underfunded are silently skipped.
      </p>
      <div className="flex gap-2 items-end flex-wrap">
        <Input label="Schedule IDs (comma-separated, or blank for all)" placeholder="0,1,2" value={idsInput} onChange={e => setIdsInput(e.target.value)} className="flex-1 min-w-48" />
        <Btn onClick={execute} loading={isPending || isConfirming} className="mb-0">Execute</Btn>
      </div>
      <TxState hash={hash} isPending={isPending} isConfirming={isConfirming} isSuccess={isSuccess} isError={isError} errorMsg={parseWriteError(error)} chainId={CHAIN} />
    </Card>
  )
}
