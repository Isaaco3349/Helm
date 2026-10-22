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
    <header style={{
      background: 'var(--header-bg)',
      color: 'var(--header-fg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 18px',
      height: '52px',
      flexShrink: 0,
      gap: '12px',
    }}>
      {/* Left: wordmark + subtitle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
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
          fontSize: '11px',
          color: 'var(--header-muted)',
          border: '1px solid rgba(255,255,255,0.18)',
          borderRadius: '999px',
          padding: '2px 8px',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}>
          Arc mainnet
        </span>
        <span style={{
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        {address && !isArc && (
          <button
            onClick={() => switchChain({ chainId: ARC_MAINNET_ID })}
            style={{
              fontSize: '11px',
              padding: '4px 10px',
              borderRadius: '6px',
              background: 'var(--semantic-error)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Switch to Arc
          </button>
        )}
        {address && isArc && (
          <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--header-muted)', fontVariantNumeric: 'tabular-nums' }}>
            {walletBal !== undefined && (
              <span>
                Wallet: <strong style={{ color: 'var(--header-fg)' }}>{fmtUsdc(walletBal)}</strong>
              </span>
            )}
            {vaultAddr && vaultBal !== undefined && (
              <span>
                Vault: <strong style={{ color: 'var(--header-fg)' }}>{fmtUsdc(vaultBal)}</strong>
              </span>
            )}
          </div>
        )}
        <ConnectKitButton.Custom>
          {({ isConnected, show, address: addr }) => (
            <button
              onClick={show}
              style={{
                fontSize: '12px',
                padding: '6px 12px',
                borderRadius: '6px',
                background: 'var(--accent)',
                color: 'var(--header-fg)',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {isConnected ? fmtAddress(addr ?? '') : 'Connect Wallet'}
            </button>
          )}
        </ConnectKitButton.Custom>
      </div>
    </header>
  )
}
