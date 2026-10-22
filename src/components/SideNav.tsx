import {
  LayoutDashboard, ShieldCheck, Bot, LockKeyhole,
  CalendarClock, Activity, PlayCircle
} from 'lucide-react'

export type NavTab = 'overview' | 'policy' | 'agents' | 'escrow' | 'schedules' | 'activity' | 'demo'

interface NavProps {
  active: NavTab
  onChange: (tab: NavTab) => void
}

const NAV_ITEMS: { id: NavTab; label: string; Icon: React.ElementType }[] = [
  { id: 'overview',  label: 'Overview',   Icon: LayoutDashboard },
  { id: 'policy',    label: 'Policy',     Icon: ShieldCheck },
  { id: 'agents',    label: 'Agent desk', Icon: Bot },
  { id: 'escrow',    label: 'Escrow',     Icon: LockKeyhole },
  { id: 'schedules', label: 'Schedules',  Icon: CalendarClock },
  { id: 'activity',  label: 'Activity',   Icon: Activity },
  { id: 'demo',      label: 'Demo',       Icon: PlayCircle },
]

/** Side nav — always visible on the left */
export function SideNav({ active, onChange }: NavProps) {
  return (
    <nav style={{
      display: 'flex',
      flexDirection: 'column',
      width: '160px',
      minWidth: '160px',
      flexShrink: 0,
      padding: '0.5rem 0',
      gap: '2px',
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      overflowY: 'auto',
    }}>
      {NAV_ITEMS.map(({ id, label, Icon }) => {
        const isActive = active === id
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 14px',
              fontSize: '13px',
              fontWeight: 500,
              textAlign: 'left',
              background: isActive ? 'rgba(107,99,88,0.14)' : 'transparent',
              color: isActive ? 'var(--text)' : 'var(--text-muted)',
              borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
              border: 'none',
              borderLeftWidth: '3px',
              borderLeftStyle: 'solid',
              borderLeftColor: isActive ? 'var(--accent)' : 'transparent',
              cursor: 'pointer',
              width: '100%',
              transition: 'background 0.15s',
            }}
          >
            <Icon size={15} strokeWidth={1.8} style={{ flexShrink: 0 }} />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}

/** Mobile bottom tab bar */
export function BottomTabs({ active, onChange }: NavProps) {
  return (
    <nav className="helm-bottomtabs" style={{
      display: 'flex',
      borderTop: '1px solid var(--border)',
      background: 'var(--surface)',
      flexShrink: 0,
    }}>
      {NAV_ITEMS.map(({ id, label, Icon }) => {
        const isActive = active === id
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '8px 2px',
              fontSize: '10px',
              gap: '2px',
              background: 'transparent',
              color: isActive ? 'var(--text)' : 'var(--text-muted)',
              borderTop: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              border: 'none',
              borderTopWidth: '2px',
              borderTopStyle: 'solid',
              borderTopColor: isActive ? 'var(--accent)' : 'transparent',
              cursor: 'pointer',
              minWidth: 0,
            }}
          >
            <Icon size={15} strokeWidth={1.8} />
            <span style={{ fontSize: '9px', whiteSpace: 'nowrap' }}>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
