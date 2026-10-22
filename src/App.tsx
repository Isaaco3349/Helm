/**
 * Helm — Policy vault for human-funded agent payments
 * Built with Arc Studio · https://studio.arc.io
 */
import { useState } from 'react'
import { useVaultAddress } from '@/lib/useVault'
import { TopBar } from '@/components/TopBar'
import { SideNav, NavTab } from '@/components/SideNav'
import { OverviewPanel } from '@/components/OverviewPanel'
import { PolicyPanel } from '@/components/PolicyPanel'
import { AgentPanel } from '@/components/AgentPanel'
import { EscrowPanel } from '@/components/EscrowPanel'
import { SchedulesPanel } from '@/components/SchedulesPanel'
import { ActivityPanel } from '@/components/ActivityPanel'
import { DemoPanel } from '@/components/DemoPanel'

export default function App() {
  const [tab, setTab] = useState<NavTab>('overview')
  const { vaultAddr, refetch: refetchVault } = useVaultAddress()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--bg)' }}>
      <TopBar vaultAddr={vaultAddr} />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {/* Desktop side nav */}
        <SideNav active={tab} onChange={setTab} />

        {/* Main content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
          <div style={{ maxWidth: '960px', margin: '0 auto' }}>
            <TabContent
              tab={tab}
              vaultAddr={vaultAddr}
              onVaultCreated={() => { void refetchVault(); setTab('overview') }}
            />
          </div>
        </main>
      </div>

    </div>
  )
}

function TabContent({
  tab,
  vaultAddr,
  onVaultCreated,
}: {
  tab: NavTab
  vaultAddr?: `0x${string}`
  onVaultCreated: () => void
}) {
  if (tab === 'overview')   return <OverviewPanel vaultAddr={vaultAddr} onVaultCreated={onVaultCreated} />
  if (tab === 'policy')     return <PolicyPanel vaultAddr={vaultAddr} />
  if (tab === 'agents')     return <AgentPanel vaultAddr={vaultAddr} />
  if (tab === 'escrow')     return <EscrowPanel vaultAddr={vaultAddr} />
  if (tab === 'schedules')  return <SchedulesPanel vaultAddr={vaultAddr} />
  if (tab === 'activity')   return <ActivityPanel vaultAddr={vaultAddr} />
  if (tab === 'demo')       return <DemoPanel vaultAddr={vaultAddr} />
  return null
}
