/**
 * Agent Desk — executors submit PaymentIntents here.
 * Also lets the owner add/remove executor addresses.
 */
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { toast } from 'sonner'
import { VAULT_ABI } from '@/lib/helm-contracts'
import { parseUsdcInput, parseWriteError } from '@/lib/format'
import { ARC_MAINNET_ID } from '@/config'
import { Card, Btn, Input, TxState } from './Card'
import { useState } from 'react'


const CHAIN = ARC_MAINNET_ID

export function AgentPanel({ vaultAddr }: { vaultAddr?: `0x${string}` }) {
  const { address } = useAccount()

  if (!address || !vaultAddr) {
    return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Connect wallet and create a vault first.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <ExecutorManager vaultAddr={vaultAddr} />
      <SubmitIntentForm vaultAddr={vaultAddr} />
    </div>
  )
}

function ExecutorManager({ vaultAddr }: { vaultAddr: `0x${string}` }) {
  const [addInput, setAddInput] = useState('')
  const [rmInput, setRmInput] = useState('')

  const { writeContract: addEx, data: addHash, isPending: addPending } = useWriteContract()
  const { isLoading: addConfirming, isSuccess: addSuccess, isError: addError, error: addErr } = useWaitForTransactionReceipt({ hash: addHash })
  if (addSuccess) { setAddInput(''); toast.success('Executor added.') }

  const { writeContract: rmEx, data: rmHash, isPending: rmPending } = useWriteContract()
  const { isLoading: rmConfirming, isSuccess: rmSuccess, isError: rmError, error: rmErr } = useWaitForTransactionReceipt({ hash: rmHash })
  if (rmSuccess) { setRmInput(''); toast.success('Executor removed.') }

  return (
    <Card title="Executor (agent) management">
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        Only the vault owner can add or remove executors. Executors are the agent wallets that submit PaymentIntents.
      </p>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Input label="Add executor address" placeholder="0x… (agent EOA)" value={addInput} onChange={e => setAddInput(e.target.value)} />
          <Btn onClick={() => addEx({ address: vaultAddr, abi: VAULT_ABI, functionName: 'addExecutor', args: [addInput as `0x${string}`], chainId: CHAIN })} loading={addPending || addConfirming}>
            Add executor
          </Btn>
          <TxState hash={addHash} isPending={addPending} isConfirming={addConfirming} isSuccess={addSuccess} isError={addError} errorMsg={parseWriteError(addErr)} chainId={CHAIN} />
        </div>
        <div className="flex flex-col gap-2">
          <Input label="Remove executor address" placeholder="0x…" value={rmInput} onChange={e => setRmInput(e.target.value)} />
          <Btn variant="ghost" onClick={() => rmEx({ address: vaultAddr, abi: VAULT_ABI, functionName: 'removeExecutor', args: [rmInput as `0x${string}`], chainId: CHAIN })} loading={rmPending || rmConfirming}>
            Remove executor
          </Btn>
          <TxState hash={rmHash} isPending={rmPending} isConfirming={rmConfirming} isSuccess={rmSuccess} isError={rmError} errorMsg={parseWriteError(rmErr)} chainId={CHAIN} />
        </div>
      </div>
    </Card>
  )
}

function SubmitIntentForm({ vaultAddr }: { vaultAddr: `0x${string}` }) {
  const [payee, setPayee] = useState('')
  const [amount, setAmount] = useState('')
  const [serviceRef, setServiceRef] = useState('')
  const [hoursAhead, setHoursAhead] = useState('24')

  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  if (isSuccess) { setPayee(''); setAmount(''); setServiceRef(''); toast.success('Intent submitted!') }

  function submit() {
    const raw = parseUsdcInput(amount)
    if (!payee || !raw) return
    const deadline = BigInt(Math.floor(Date.now() / 1000) + Number(hoursAhead) * 3600)
    // Encode serviceRef as keccak-like bytes32 — just use padEnd for human labels
    let refBytes: `0x${string}`
    try {
      // If already 0x hex, use as-is
      if (serviceRef.startsWith('0x') && serviceRef.length === 66) {
        refBytes = serviceRef as `0x${string}`
      } else {
        // Encode as UTF-8 padded to 32 bytes
        const enc = new TextEncoder().encode(serviceRef.slice(0, 32))
        const arr = new Uint8Array(32)
        arr.set(enc)
        refBytes = ('0x' + Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`
      }
    } catch {
      refBytes = '0x' + '00'.repeat(32) as `0x${string}`
    }
    writeContract({
      address: vaultAddr,
      abi: VAULT_ABI,
      functionName: 'submitIntent',
      args: [payee as `0x${string}`, refBytes, BigInt(raw) as unknown as number & bigint, BigInt(deadline) as unknown as number & bigint],
      chainId: CHAIN,
    })
  }

  return (
    <Card title="Submit payment intent">
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        As an executor, submit a payment intent on behalf of the vault. The vault will route it to the instant lane (if eligible) or escrow lane.
      </p>
      <div className="grid md:grid-cols-2 gap-3">
        <Input label="Payee address" placeholder="0x… service address" value={payee} onChange={e => setPayee(e.target.value)} />
        <Input label="Amount (USDC)" type="number" min="0" step="0.000001" placeholder="0.05" value={amount} onChange={e => setAmount(e.target.value)} />
        <Input label="Service reference (label)" placeholder="api.example.com/inference" value={serviceRef} onChange={e => setServiceRef(e.target.value)} />
        <Input label="Deadline (hours from now)" type="number" min="1" max="720" value={hoursAhead} onChange={e => setHoursAhead(e.target.value)} />
      </div>
      <div className="mt-3 flex gap-2 items-center">
        <Btn onClick={submit} loading={isPending || isConfirming}>
          Submit intent
        </Btn>
        {isError && <Btn variant="ghost" onClick={reset}>Reset</Btn>}
      </div>
      <TxState hash={hash} isPending={isPending} isConfirming={isConfirming} isSuccess={isSuccess} isError={isError} errorMsg={parseWriteError(error)} chainId={CHAIN} />
    </Card>
  )
}
