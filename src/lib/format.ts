/** Shared formatting utilities for Helm */

export function fmtAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/** Format a 6-decimal USDC raw bigint as a dollar string like "$1.23" */
export function fmtUsdc(raw: bigint | number | undefined): string {
  if (raw === undefined || raw === null) return '—'
  const n = typeof raw === 'bigint' ? Number(raw) : raw
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(n / 1_000_000)
}

/** Parse a dollar string like "1.23" to 6-decimal raw bigint */
export function parseUsdcInput(s: string): bigint {
  const n = parseFloat(s)
  if (isNaN(n) || n < 0) return 0n
  return BigInt(Math.round(n * 1_000_000))
}

/** Format a unix timestamp to a short locale date/time */
export function fmtTs(ts: number | bigint): string {
  const ms = (typeof ts === 'bigint' ? Number(ts) : ts) * 1000
  return new Date(ms).toLocaleString()
}

/** Format seconds as "7 days" / "30 days" */
export function fmtInterval(s: number): string {
  if (s === 604800) return '7 days (weekly)'
  if (s === 2592000) return '30 days (monthly)'
  const days = Math.floor(s / 86400)
  return `${days} days`
}

/** Returns error string from wagmi/viem error or undefined */
export function parseWriteError(err: unknown): string {
  if (!err) return ''
  const msg = (err as { message?: string })?.message ?? JSON.stringify(err)
  if (msg.toLowerCase().includes('user rejected') || msg.includes('4001')) return 'Transaction cancelled.'
  if (msg.includes('insufficient')) return 'Insufficient balance.'
  if (msg.includes('not executor')) return 'This address is not an approved executor.'
  if (msg.includes('daily limit')) return 'Daily spend limit would be exceeded.'
  if (msg.includes('reverted')) {
    const m = msg.match(/reason="([^"]+)"/)
    return m ? `Failed: ${m[1]}` : 'Transaction failed.'
  }
  if (msg.length > 120) return msg.slice(0, 120) + '…'
  return msg
}
