/**
 * Demo panel — numbered walkthrough + How It Works + FAQ
 */
import { useState } from 'react'
import { Card, Input } from './Card'
import { fmtAddress } from '@/lib/format'
import { FACTORY_ADDRESS } from '@/lib/helm-contracts'
import { useAccount } from 'wagmi'
import { HowItWorks, FAQ } from './LandingExtra'


const EXPLORER = 'https://explorer.arc.io'

export function DemoPanel({ vaultAddr }: { vaultAddr?: `0x${string}` }) {
  const { address } = useAccount()
  const [agentAddr, setAgentAddr] = useState('')
  const [payeeAddr, setPayeeAddr] = useState('')

  const ownerAddr = address ?? ''

  const steps = [
    {
      n: 1,
      title: 'Sponsor creates a vault',
      desc: 'The owner (sponsor) connects their wallet on Arc mainnet and clicks "Create Vault" on the Overview tab. This deploys a new HelmVault with the owner as the controller.',
      link: vaultAddr ? { label: 'View vault on explorer', href: `${EXPLORER}/address/${vaultAddr}` } : undefined,
      detail: vaultAddr ? `Vault: ${vaultAddr}` : 'Vault not created yet — go to Overview.',
    },
    {
      n: 2,
      title: 'Sponsor deposits USDC',
      desc: 'On the Overview tab the owner approves + deposits a small amount of real USDC ($1–5 is enough for the demo). This funds the vault for agent payments.',
      detail: vaultAddr ? `Vault holds deposited USDC at ${fmtAddress(vaultAddr)}` : 'Create vault first.',
    },
    {
      n: 3,
      title: 'Owner configures policy',
      desc: 'On the Policy tab, set the instant-lane cap (e.g. $0.10) and optionally a daily spend limit. Add the payee address to the allowlist so the instant lane can fire.',
      detail: payeeAddr ? `Payee ${fmtAddress(payeeAddr)} → allowlist` : 'Enter payee address below.',
    },
    {
      n: 4,
      title: 'Owner approves the agent executor',
      desc: 'On the Agent desk tab, add the agent wallet address as an executor. This authorises it to submit PaymentIntents on behalf of the vault.',
      detail: agentAddr ? `Executor: ${fmtAddress(agentAddr)}` : 'Enter agent address below.',
    },
    {
      n: 5,
      title: 'Agent submits a PaymentIntent',
      desc: 'The agent wallet (executor) goes to the Agent desk tab and submits a PaymentIntent — payee address, amount, and a service reference. If amount ≤ cap AND payee is allowlisted → instant lane: USDC transfers immediately. Otherwise → escrow lane: USDC is locked until owner releases.',
      detail: 'Intent goes through instant lane (if eligible) or escrow lane.',
    },
    {
      n: 6,
      title: 'Owner releases (or refunds) escrowed intent',
      desc: 'On the Escrow tab, the owner reviews locked intents and either releases with a proof hash (delivery confirmed), approves without proof, cancels, or refunds after the deadline.',
      detail: 'Use intent ID from the Escrow tab.',
    },
    {
      n: 7,
      title: 'Optional: create a scheduled payment',
      desc: 'On the Schedules tab, the owner creates a weekly or monthly schedule for a payee (e.g. a service retainer). Any wallet can then call "Execute due schedules" when the interval passes.',
      detail: 'Schedules run at weekly (7 days) or monthly (30 days) intervals.',
    },
    {
      n: 8,
      title: 'Verify on-chain',
      desc: 'All transactions — deposit, intent submission, releases, schedules — are visible on the Arc explorer. Use the links from the Tracing panel in Arc Studio or below.',
      link: vaultAddr ? { label: 'View vault on Arc explorer', href: `${EXPLORER}/address/${vaultAddr}` } : undefined,
      detail: FACTORY_ADDRESS ? `Factory: ${fmtAddress(FACTORY_ADDRESS)}` : 'Factory not deployed.',
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <Card title="Demo addresses">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 500, marginBottom: '3px', color: 'var(--text-muted)' }}>Sponsor (Owner)</div>
            <div style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--text)', wordBreak: 'break-all' }}>
              {ownerAddr || 'Connect wallet'}
            </div>
          </div>
          <Input label="Agent (Executor) address" placeholder="0x… agent wallet" value={agentAddr} onChange={e => setAgentAddr(e.target.value)} />
          <Input label="Payee (Service) address" placeholder="0x… payee wallet" value={payeeAddr} onChange={e => setPayeeAddr(e.target.value)} />
        </div>
        {vaultAddr && (
          <div style={{ marginTop: '10px', fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
            Vault: <a href={`${EXPLORER}/address/${vaultAddr}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text)', textDecoration: 'underline' }}>{vaultAddr}</a>
          </div>
        )}
      </Card>

      {steps.map(step => (
        <div key={step.n} className="flex gap-3">
          <div
            className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold mt-0.5"
            style={{ background: 'var(--accent)', color: 'var(--header-fg)' }}
          >
            {step.n}
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-sm mb-1" style={{ color: 'var(--text)' }}>{step.title}</h4>
            <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{step.desc}</p>
            <p className="text-xs font-mono" style={{ color: 'var(--accent)' }}>{step.detail}</p>
            {step.link && (
              <a href={step.link.href} target="_blank" rel="noopener noreferrer" className="text-xs underline mt-1 inline-block" style={{ color: 'var(--text-muted)' }}>
                {step.link.label}
              </a>
            )}
          </div>
        </div>
      ))}

      <Card title="Contract addresses">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
          <div><span style={{ color: 'var(--text-muted)' }}>Factory: </span>
            {FACTORY_ADDRESS
              ? <a href={`${EXPLORER}/address/${FACTORY_ADDRESS}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text)', textDecoration: 'underline' }}>{FACTORY_ADDRESS}</a>
              : 'Not deployed'}
          </div>
          <div><span style={{ color: 'var(--text-muted)' }}>Your vault: </span>
            {vaultAddr
              ? <a href={`${EXPLORER}/address/${vaultAddr}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text)', textDecoration: 'underline' }}>{vaultAddr}</a>
              : '—'}
          </div>
          <div><span style={{ color: 'var(--text-muted)' }}>USDC: </span>0x3600000000000000000000000000000000000000</div>
          <div><span style={{ color: 'var(--text-muted)' }}>Network: </span>Arc mainnet (Chain ID 5042)</div>
        </div>
      </Card>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--border)', margin: '0.5rem 0' }} />

      {/* How It Works */}
      <HowItWorks />

      <div style={{ borderTop: '1px solid var(--border)', margin: '0.5rem 0' }} />

      {/* FAQ */}
      <FAQ />
    </div>
  )
}
