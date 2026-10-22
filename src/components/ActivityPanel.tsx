/**
 * Activity panel — reads recent events from the vault using getLogs.
 */
import { useState, useEffect, useRef } from 'react'
import { createPublicClient, http, parseAbiItem } from 'viem'
import { arc } from 'viem/chains'
import { ARC_MAINNET_ID } from '@/config'
import { fmtUsdc, fmtAddress } from '@/lib/format'
import { Card } from './Card'
import { buildTxExplorerUrl } from '@/onchain-facts'

const CHAIN = ARC_MAINNET_ID

type LogEvent = {
  name: string
  txHash: `0x${string}`
  blockNumber: bigint
  args: Record<string, unknown>
}

const EVENT_ABIS = [
  parseAbiItem('event Deposited(address indexed from, uint256 amount)'),
  parseAbiItem('event Withdrawn(address indexed to, uint256 amount)'),
  parseAbiItem('event IntentInstantPaid(uint256 indexed intentId, address indexed executor, address indexed payee, uint96 amount, bytes32 serviceRef)'),
  parseAbiItem('event IntentLocked(uint256 indexed intentId, address indexed executor, address indexed payee, uint96 amount, uint64 deadline)'),
  parseAbiItem('event IntentReleased(uint256 indexed intentId, bytes32 proofHash)'),
  parseAbiItem('event IntentRefunded(uint256 indexed intentId)'),
  parseAbiItem('event IntentCancelled(uint256 indexed intentId)'),
  parseAbiItem('event ScheduleCreated(uint256 indexed scheduleId, address indexed payee, uint96 amount, uint32 intervalSeconds)'),
  parseAbiItem('event ScheduleExecuted(uint256 indexed scheduleId, address indexed payee, uint96 amount)'),
]

export function ActivityPanel({ vaultAddr }: { vaultAddr?: `0x${string}` }) {
  const [events, setEvents] = useState<LogEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string>()
  const inFlight = useRef(false)

  useEffect(() => {
    if (!vaultAddr || inFlight.current) return
    inFlight.current = true
    let cancelled = false

    const run = async () => {
      setIsLoading(true)
      setFetchError(undefined)
      const client = createPublicClient({ chain: arc, transport: http('https://rpc.mainnet.arc.io') })
      try {
        const head = await client.getBlockNumber()
        // Only scan recent ~5000 blocks to avoid genesis scan
        const fromBlock = head > 5000n ? head - 5000n : 0n
        const all: LogEvent[] = []
        for (const abi of EVENT_ABIS) {
          const logs = await client.getLogs({
            address: vaultAddr,
            event: abi,
            fromBlock,
            toBlock: 'latest',
          })
          for (const log of logs) {
            all.push({
              name: (abi as { name: string }).name,
              txHash: log.transactionHash,
              blockNumber: log.blockNumber ?? 0n,
              args: (log.args ?? {}),
            })
          }
        }
        all.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1))
        if (!cancelled) setEvents(all)
      } catch {
        if (!cancelled) setFetchError('Could not fetch events. Vault may be new or RPC unreachable.')
      } finally {
        inFlight.current = false
        if (!cancelled) setIsLoading(false)
      }
    }

    void run()
    return () => { cancelled = true }
  }, [vaultAddr])

  if (!vaultAddr) {
    return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Connect wallet and create a vault first.</p>
  }

  return (
    <Card title={`Recent activity${events.length ? ` (${events.length})` : ''}`}>
      {isLoading && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading events…</p>}
      {fetchError && <p className="text-xs" style={{ color: 'var(--semantic-error)' }}>{fetchError}</p>}
      {!isLoading && !fetchError && events.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No events found in the last 5,000 blocks.</p>
      )}
      <div className="flex flex-col gap-2 mt-1">
        {events.map((ev, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 py-2 px-3 rounded text-xs" style={{ background: 'rgba(107,99,88,0.07)', border: '1px solid var(--border)' }}>
            <span className="font-medium" style={{ color: 'var(--text)' }}>{ev.name}</span>
            {ev.args.amount !== undefined && (
              <span className="tabular-nums" style={{ color: 'var(--text)' }}>{fmtUsdc(ev.args.amount as bigint)}</span>
            )}
            {ev.args.payee !== undefined && (
              <span style={{ color: 'var(--text-muted)' }}>
                to <span className="font-mono">{fmtAddress(ev.args.payee as string)}</span>
              </span>
            )}
            {ev.args.intentId !== undefined && (
              <span style={{ color: 'var(--text-muted)' }}>Intent #{(ev.args.intentId as bigint).toString()}</span>
            )}
            {ev.args.scheduleId !== undefined && (
              <span style={{ color: 'var(--text-muted)' }}>Schedule #{(ev.args.scheduleId as bigint).toString()}</span>
            )}
            <a
              href={buildTxExplorerUrl(CHAIN, ev.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto font-mono underline"
              style={{ color: 'var(--text-muted)' }}
            >
              {fmtAddress(ev.txHash)}
            </a>
          </div>
        ))}
      </div>
    </Card>
  )
}
