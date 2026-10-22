import { ConnectKitButton } from 'connectkit'
import { useAccount, useSwitchChain } from 'wagmi'
import { useWalletUsdcBalance, useVaultBalance } from '@/lib/useVault'
import { fmtAddress, fmtUsdc } from '@/lib/format'
import { ARC_MAINNET_ID } from '@/config'

interface TopBarProps {
  vaultAddr?: `0x${string}`
}

export function TopBar({ vaultAddr }: TopBarProps) {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const { balance: walletBal } = useWalletUsdcBalance(address)
  const { balance: vaultBal } = useVaultBalance(vaultAddr)
  const isArc = chainId === ARC_MAINNET_ID

  return (
    <>
      <style>{`
        .helm-topbar-subtitle { display: inline; }
        .helm-topbar-balances { display: flex; }
        @media (max-width: 519px) {
          .helm-topbar-subtitle { display: none; }
          .helm-topbar-balances { display: none; }
        }
      `}</style>
      <header style={{
        background: 'var(--header-bg)',
        color: 'var(--header-fg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 14px',
        height: '52px',
        flexShrink: 0,
        gap: '8px',
      }}>
        {/* Left: wordmark + badge + subtitle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
          <span style={{
            fontFamily: 'var(--font-display)',
            fontSize: '18px',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'var(--header-fg)',
            flexShrink: 0,
          }}>
            Helm
          </span>
          <span style={{
            fontSize: '10px',
            color: 'var(--header-muted)',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: '999px',
            padding: '2px 7px',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}>
            Arc mainnet
          </span>
          <span className="helm-topbar-subtitle" style={{
            fontSize: '12px',
            color: 'var(--header-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            Agent payments under policy
          </span>
        </div>

        {/* Right: balances + chain warning + connect button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {address && !isArc && (
            <button
              onClick={() => switchChain({ chainId: ARC_MAINNET_ID })}
              style={{
                fontSize: '11px',
                padding: '4px 9px',
                borderRadius: '6px',
                background: 'var(--semantic-error)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Switch network
            </button>
          )}

          {address && isArc && (
            <div className="helm-topbar-balances" style={{ gap: '10px', alignItems: 'center' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '10px', color: 'var(--header-muted)' }}>Wallet</div>
                <div style={{ fontSize: '12px', fontWeight: 600 }}>{fmtUsdc(walletBal)}</div>
              </div>
              {vaultAddr && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '10px', color: 'var(--header-muted)' }}>Vault</div>
                  <div style={{ fontSize: '12px', fontWeight: 600 }}>{fmtUsdc(vaultBal)}</div>
                </div>
              )}
              <div style={{
                fontSize: '11px',
                color: 'var(--header-muted)',
                fontFamily: 'monospace',
                background: 'rgba(255,255,255,0.08)',
                padding: '3px 7px',
                borderRadius: '5px',
              }}>
                {fmtAddress(address)}
              </div>
            </div>
          )}

          <ConnectKitButton />
        </div>
      </header>
    </>
  )
}
