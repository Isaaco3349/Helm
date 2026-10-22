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

/**
 * Responsive side nav:
 * - ≥ 520 px: full labels (160 px wide)
 * - < 520 px: icons only (44 px wide)
 * A CSS media query injected via a <style> tag keeps this purely inline.
 */
export function SideNav({ active, onChange }: NavProps) {
  return (
    <>
      <style>{`
        .helm-nav-label { display: inline; }
        .helm-sidenav-inner { width: 160px; min-width: 160px; }
        @media (max-width: 519px) {
          .helm-nav-label { display: none; }
          .helm-sidenav-inner { width: 44px; min-width: 44px; }
        }
      `}</style>
      <nav className="helm-sidenav-inner" style={{
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        padding: '0.5rem 0',
        gap: '2px',
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        overflowY: 'auto',
        overflowX: 'hidden',
        transition: 'width 0.2s',
      }}>
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const isActive = active === id
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              title={label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 12px',
                fontSize: '13px',
                fontWeight: 500,
                textAlign: 'left',
                background: isActive ? 'rgba(107,99,88,0.14)' : 'transparent',
                color: isActive ? 'var(--text)' : 'var(--text-muted)',
                borderLeft: 'none',
                borderRight: 'none',
                borderTop: 'none',
                borderBottom: 'none',
                borderLeftWidth: '3px',
                borderLeftStyle: 'solid',
                borderLeftColor: isActive ? 'var(--accent)' : 'transparent',
                cursor: 'pointer',
                width: '100%',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
            >
              <Icon size={16} strokeWidth={1.8} style={{ flexShrink: 0 }} />
              <span className="helm-nav-label" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {label}
              </span>
            </button>
          )
        })}
      </nav>
    </>
  )
}
