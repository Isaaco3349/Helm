# Helm — Policy Vault for Human-Funded Agent Payments

> Built with Arc Studio — money-powered apps in minutes

Helm is a USDC vault system that lets a human sponsor control how AI agents/services spend USDC. Supports three payment lanes: instant (auto-approved within cap + allowlist), escrow (owner releases with optional proof), and scheduled (recurring weekly/monthly payments).

---

## What This App Does

- Owner deposits USDC into a personal HelmVault
- Approved executors (agents) submit PaymentIntents
- Instant lane: fires immediately if amount ≤ auto-approve cap AND payee is allowlisted
- Escrow lane: USDC locked until owner releases (with optional proof hash) or refunds
- Schedule lane: recurring payments any caller can trigger when interval expires
- Daily spend limit enforced across all three lanes

**Branding:** Helm — "Agent payments under policy"

---

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS, DM Sans + Space Grotesk fonts
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity ^0.8.20 + Foundry (Paris EVM target for Arc). Sources in `contracts/`, unit tests in `contracts/test/HelmVault.t.sol` (106 tests, all passing).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc mainnet (Chain ID: 5042) + Arc Testnet (Chain ID: 5042002)
- Token: USDC at `0x3600000000000000000000000000000000000000` (Arc native predeploy)

---

## Contracts

| Contract | Source | Description |
|----------|--------|-------------|
| `HelmVaultFactory` | `contracts/HelmVaultFactory.sol` | Deploys HelmVaults, tracks owner→vault mapping |
| `HelmVault` | `contracts/HelmVault.sol` | Core vault: deposit, intents, escrow, schedules |

### Key constants
- `WEEKLY = 7 days` (604,800 seconds)
- `MONTHLY = 30 days` (2,592,000 seconds — approximation)
- `MAX_BATCH = 50` — max schedule IDs per executeDueSchedules call

### Deployed addresses (Arc mainnet)
- Factory: `0x8E0514894b72A0629531473E5fD8AEd6dee88861`
- Deploy tx: `0x44fe8cf9401ad106660d02533276121e30209a344ec824b77e72ef74a74dfa9f`

---

## Environment Variables

```
VITE_HELM_FACTORY_ADDRESS=0x8E0514894b72A0629531473E5fD8AEd6dee88861
```

---

## Build & Test Commands

```bash
# Build contracts
bun run contracts:build  # forge build

# Run all tests (106 tests)
bun run contracts:test   # forge test

# Frontend dev
bun run dev

# Lint + typecheck
bun run check
```

---

## Design Tokens

Custom "Helm ops console" palette (see `src/index.css`):
- Background: `#8a8276` (warm mid-tone)
- Surface: `#f4f0e8` (parchment)
- Header: `#262c34` (dark navy)
- Accent: `#6b6358`

---

## Security Review Summary

Review at **balanced** severity (Critical + High). Findings resolved:
1. Made `usdc` immutable in both contracts
2. Added `MAX_BATCH = 50` cap on `executeDueSchedules`
3. Daily spend limit now enforced on escrow release AND schedule lanes
4. Fixed dead constructor `require` (OZ Ownable already validates zero address)
5. Changed `deposit` to use `msg.sender` for clarity
