import { ReactNode } from 'react'

interface CardProps {
  title?: string
  children: ReactNode
  className?: string
  action?: ReactNode
}

export function Card({ title, children, className = '', action }: CardProps) {
  return (
    <div
      className={`rounded-lg p-5 ${className}`}
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {title && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            {title}
          </h3>
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

interface StatProps {
  label: string
  value: string
  sub?: string
}

export function Stat({ label, value, sub }: StatProps) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="text-2xl font-semibold tabular-nums font-display" style={{ color: 'var(--text)' }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  )
}

interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger'
  loading?: boolean
}

export function Btn({ variant = 'primary', loading, children, disabled, className = '', ...rest }: BtnProps) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: 'var(--accent)', color: 'var(--header-fg)', border: '1px solid var(--accent)' },
    ghost: { background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)' },
    danger: { background: 'var(--semantic-error)', color: '#fff', border: '1px solid var(--semantic-error)' },
  }
  return (
    <button
      disabled={disabled || loading}
      className={`px-4 py-2 rounded text-sm font-medium transition-opacity disabled:opacity-50 ${className}`}
      style={styles[variant]}
      {...rest}
    >
      {loading ? 'Working…' : children}
    </button>
  )
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
}
export function Input({ label, className = '', ...rest }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</label>}
      <input
        className={`px-3 py-2 rounded text-sm outline-none transition-shadow focus:ring-2 ${className}`}
        style={{
          background: 'rgba(255,255,255,0.7)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
        }}
        {...rest}
      />
    </div>
  )
}

interface TxStateProps {
  hash?: `0x${string}`
  isPending: boolean
  isConfirming: boolean
  isSuccess: boolean
  isError: boolean
  errorMsg?: string
  chainId?: number
}

export function TxState({ hash, isPending, isConfirming, isSuccess, isError, errorMsg, chainId }: TxStateProps) {
  if (!isPending && !isConfirming && !isSuccess && !isError) return null
  const explorerBase = chainId === 5042 ? 'https://explorer.arc.io' : 'https://explorer.testnet.arc.io'
  return (
    <div className="text-xs mt-2 rounded px-3 py-2" style={{
      background: isSuccess ? 'rgba(27,94,64,0.1)' : isError ? 'rgba(138,36,36,0.1)' : 'rgba(107,99,88,0.08)',
      border: `1px solid ${isSuccess ? 'var(--semantic-success)' : isError ? 'var(--semantic-error)' : 'var(--border)'}`,
      color: isSuccess ? 'var(--semantic-success)' : isError ? 'var(--semantic-error)' : 'var(--text-muted)',
    }}>
      {isPending && 'Waiting for wallet confirmation…'}
      {isConfirming && (
        <span>
          Confirming…{' '}
          {hash && (
            <a href={`${explorerBase}/tx/${hash}`} target="_blank" rel="noopener noreferrer" className="underline">
              View tx
            </a>
          )}
        </span>
      )}
      {isSuccess && (
        <span>
          Confirmed!{' '}
          {hash && (
            <a href={`${explorerBase}/tx/${hash}`} target="_blank" rel="noopener noreferrer" className="underline font-medium">
              View on explorer
            </a>
          )}
        </span>
      )}
      {isError && (errorMsg || 'Transaction failed.')}
    </div>
  )
}

export function Badge({ status }: { status: number }) {
  const map: Record<number, { label: string; bg: string; color: string }> = {
    0: { label: 'None',      bg: 'rgba(107,99,88,0.15)',    color: 'var(--text-muted)' },
    1: { label: 'Locked',    bg: 'rgba(107,99,88,0.2)',     color: 'var(--text)' },
    2: { label: 'Released',  bg: 'rgba(27,94,64,0.15)',     color: 'var(--semantic-success)' },
    3: { label: 'Refunded',  bg: 'rgba(138,36,36,0.1)',     color: 'var(--semantic-error)' },
    4: { label: 'Cancelled', bg: 'rgba(107,99,88,0.1)',     color: 'var(--text-muted)' },
  }
  const s = map[status] ?? map[0]
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}
