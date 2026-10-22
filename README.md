# Helm — Policy Vault for Human-Funded Agent Payments

> **Hold the helm. Let agents pay within policy.**

Helm is a USDC vault system deployed on **Arc mainnet** that lets a human sponsor (owner) fund a personal vault and define strict payment policies for AI agents, automation scripts, or any software executor. Agents submit payment intents; Helm routes each one through the correct lane — instant, escrow, or scheduled — automatically enforcing the rules the owner set.

**Live app:** https://arc-studio-891b66369d204264973e25a6.vercel.app  
**Factory contract (Arc mainnet):** [`0x8E0514894b72A0629531473E5fD8AEd6dee88861`](https://explorer.arc.io/address/0x8E0514894b72A0629531473E5fD8AEd6dee88861)  
**Deploy tx:** [`0x44fe8cf9...`](https://explorer.arc.io/tx/0x44fe8cf9401ad106660d02533276121e30209a344ec824b77e72ef74a74dfa9f)  
**Chain:** Arc mainnet (Chain ID 5042) — USDC is the native gas token  

---

## Table of Contents

1. [What is Helm?](#what-is-helm)
2. [Architecture overview](#architecture-overview)
3. [The three payment lanes](#the-three-payment-lanes)
4. [Smart contracts](#smart-contracts)
5. [Frontend](#frontend)
6. [Demo walkthrough](#demo-walkthrough)
7. [Project structure](#project-structure)
8. [Local development](#local-development)
9. [Running tests](#running-tests)
10. [Deploying your own instance](#deploying-your-own-instance)
11. [Security review summary](#security-review-summary)
12. [FAQ](#faq)
13. [License](#license)

---

## What is Helm?

Modern AI agents and automation scripts need to spend money — to call APIs, pay for inference, settle invoices, run retainers. But handing an agent an unconstrained wallet is dangerous. Helm solves this by sitting between the human funder and the software spender:

- **Owners** deposit USDC into a personal `HelmVault` and define policy: per-transaction caps, daily spend limits, an allowlist of trusted payees, and a list of approved executor wallets.
- **Executors** (agents) submit `PaymentIntent` transactions. Helm inspects each intent against the policy and routes it to the correct lane.
- **Intents** are either paid instantly, held in escrow for human review, or fulfilled on a recurring schedule.

The owner never gives up their private key — the agent's wallet is only approved to _request_ payments, not to drain the vault.

---

## Architecture overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Arc mainnet                             │
│                                                                 │
│  ┌──────────────────────┐      ┌──────────────────────────────┐ │
│  │  HelmVaultFactory    │      │        HelmVault             │ │
│  │                      │      │                              │ │
│  │  createVault()  ───────────►│  owner       executors[]    │ │
│  │  ownerToVault[]      │      │  usdc        allowlist[]    │ │
│  │  getAllVaults()       │      │                              │ │
│  └──────────────────────┘      │  intents[]   schedules[]    │ │
│                                │  autoApproveMax              │ │
│         USDC (ERC-20)          │  dailySpendLimit             │ │
│  0x3600...0000  ───────────────►                              │ │
│                                └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘

Roles:
  Owner (Sponsor)  — creates vault, deposits USDC, sets policy, releases escrow
  Executor (Agent) — submits PaymentIntents, triggers schedule execution
  Payee (Service)  — receives USDC on instant pay, escrow release, or schedule run
```

**Key design decisions:**

| Decision | Choice | Reason |
|---|---|---|
| Token | USDC (Arc native predeploy) | Stablecoin, zero gas-token friction on Arc |
| Upgradeability | Immutable | Simpler trust model; no proxy risk |
| Custody | Non-custodial per vault | Each owner controls their own vault |
| Factory | Clone-free `new HelmVault(owner, usdc)` | Simpler, auditable; CREATE2 follow-up in roadmap |
| EVM target | Paris | Arc mainnet compatibility |

---

## The three payment lanes

Every `PaymentIntent` submitted by an executor is evaluated against this decision tree:

```
submitIntent(payee, serviceRef, amount, deadline)
        │
        ▼
Is caller an approved executor?  ──No──► revert
        │ Yes
        ▼
Is amount > 0 and deadline in future?  ──No──► revert
        │ Yes
        ▼
Does vault have enough USDC?  ──No──► revert
        │ Yes
        ▼
        ┌──────────────────────────────────────────┐
        │           Lane selection                 │
        │                                          │
        │  amount ≤ autoApproveMax                 │
        │    AND payee in allowlist                │
        │    AND daily limit not exceeded?         │
        └──────────────────────────────────────────┘
               │ YES                     │ NO
               ▼                         ▼
        INSTANT LANE              ESCROW LANE
        USDC transfers            USDC locked in vault
        immediately               status = Locked
        status = Released         owner must act
        emit IntentInstantPaid    emit IntentLocked
```

### Lane 1 — Instant

Triggered when **all three** conditions are met:
- `amount ≤ autoApproveMax` (set by owner on Policy tab)
- `payee` is on the owner's allowlist
- Daily spend limit is not exceeded (or is set to zero / unlimited)

USDC is transferred to the payee atomically in the same transaction. No further action needed.

### Lane 2 — Escrow

Triggered when any instant condition fails. The USDC is **locked inside the vault** (not transferred). The `PaymentIntent` record stores the executor, payee, amount, deadline, and a `serviceRef` (keccak256 of the service identifier, e.g. `keccak256("api.example.com/inference")`).

The owner then has three choices:

| Action | Function | When to use |
|---|---|---|
| Release with proof | `releaseIntent(intentId, proofHash)` | Service delivered; `proofHash` is keccak256 of the delivery proof (receipt, log hash, etc.) |
| Approve without proof | `approveIntent(intentId)` | Quick approval, no proof needed |
| Cancel | `cancelIntent(intentId)` | Intent was wrong; USDC stays in vault |
| Refund after deadline | `refundIntent(intentId)` | Deadline passed, service not delivered; USDC stays in vault |

The daily spend limit is enforced on escrow releases too — releasing a large locked intent still counts against that day's cap.

### Lane 3 — Scheduled

The owner creates `ScheduledPayment` records for recurring obligations (retainers, subscriptions, payroll). Each schedule has:

- `payee` — recipient
- `amount` — USDC per run (6-decimal)
- `intervalSeconds` — `WEEKLY` (604,800 s) or `MONTHLY` (2,592,000 s ≈ 30 days)
- `nextRunAt` — Unix timestamp of the next due execution
- `runsRemaining` — 0 means unlimited; > 0 counts down and deactivates at zero

**Any wallet** can call `executeDueSchedules(uint256[] calldata scheduleIds)` once `block.timestamp >= nextRunAt`. This is intentional — it allows keeper bots, automation services, or the payee themselves to trigger execution without requiring the owner online. Capped at 50 IDs per call to prevent gas-limit DoS.

---

## Smart contracts

### `HelmVaultFactory`

Source: `contracts/HelmVaultFactory.sol`

```solidity
function createVault() external returns (address vault)
function getVault(address owner) external view returns (address)
function getAllVaults() external view returns (address[] memory)
```

Deploys a new `HelmVault` with `msg.sender` as owner. Tracks `ownerToVault` mapping and a global `vaults[]` array. One owner gets one vault per `createVault()` call (later calls overwrite the mapping but append to the array).

**Deployed (Arc mainnet):** `0x8E0514894b72A0629531473E5fD8AEd6dee88861`

### `HelmVault`

Source: `contracts/HelmVault.sol`

The core contract. Key storage:

```solidity
IERC20 public immutable usdc;          // Arc USDC predeploy
address public owner;                  // via OpenZeppelin Ownable
mapping(address => bool) executors;    // approved agent wallets
mapping(address => bool) allowlistedPayees;
uint96 public autoApproveMax;          // per-tx instant lane cap
uint96 public dailySpendLimit;         // 0 = unlimited
uint96 public spentToday;
uint64 public dayBucket;               // floor(block.timestamp / 86400)
mapping(uint256 => PaymentIntent) public intents;
mapping(uint256 => ScheduledPayment) public schedules;
```

**Security properties enforced in contract:**
- `ReentrancyGuard` on every function that transfers USDC
- `SafeERC20` for all token operations
- Check-Effects-Interactions ordering throughout
- Daily spend limit enforced on instant lane, escrow releases, and schedule executions
- `MAX_BATCH = 50` cap on `executeDueSchedules`
- All USDC addresses are `immutable` (set once in constructor, cannot be changed)

### USDC address

Arc mainnet and testnet both use the same predeploy address:

```
0x3600000000000000000000000000000000000000
```

Source: https://docs.arc.io/arc/references/contract-addresses

---

## Frontend

Built with React 18 + TypeScript + Vite + Tailwind CSS. Web3 layer uses wagmi v2, viem v2, and ConnectKit.

### Panels

| Tab | Purpose |
|---|---|
| Overview | Vault balance, deposit USDC, withdraw USDC, create vault |
| Policy | Set auto-approve cap, daily limit, manage payee allowlist |
| Agent desk | Add/remove executors, submit PaymentIntents |
| Escrow | View all intents, release/approve/refund/cancel |
| Schedules | Create weekly/monthly schedules, execute due schedules |
| Activity | Live event log from vault (last 5,000 blocks) |
| Demo | Step-by-step walkthrough with address fields |

### Design tokens

The "Helm ops console" palette — warm neutral tones that read as professional and purposeful:

```css
--bg: #8a8276;          /* warm mid-tone background */
--surface: #f4f0e8;     /* parchment surface (cards) */
--accent: #6b6358;      /* warm brown accent */
--text: #1a1f26;        /* near-black body text */
--text-muted: #3f3a33;  /* secondary text */
--border: #5c564c;      /* warm dark border */
--header-bg: #262c34;   /* dark navy header */
--header-fg: #f4f0e8;   /* light header text */
--semantic-success: #1b5e40;
--semantic-error: #8a2424;
```

---

## Demo walkthrough

This is the exact flow used in the demo. You need two wallets: **Sponsor** (Owner) and **Agent** (Executor). A third address is the **Payee** (can be any wallet).

### Step 1 — Sponsor creates a vault

1. Open the app and connect the Sponsor wallet on **Arc mainnet** (Chain ID 5042)
2. Go to **Overview** → click **Create Vault**
3. Confirm the transaction in MetaMask. This calls `HelmVaultFactory.createVault()` and deploys a personal `HelmVault`.

### Step 2 — Sponsor deposits USDC

1. Still on Overview, enter an amount (e.g. `2.00`) in the Deposit field
2. Click **Approve & Deposit** — this sends two transactions: an ERC-20 `approve` then `deposit`
3. The vault balance updates once confirmed

> **Note:** On Arc mainnet, USDC is both the ERC-20 token and the native gas token. A small USDC balance is also needed for gas (~$0.001 per transaction).

### Step 3 — Configure policy

1. Go to **Policy**
2. Set **Auto-approve cap**: `0.10` USDC (intents at or below this amount can go instant)
3. Set **Daily spend limit**: `1.00` USDC (optional; 0 = unlimited)
4. Add the **Payee** address to the allowlist → click **Add Payee**

### Step 4 — Approve the agent

1. Still on Policy (or Agent desk)
2. Add the **Agent** wallet address as an executor → click **Add Executor**

### Step 5 — Agent submits a PaymentIntent

1. Switch wallet to the **Agent** address
2. Go to **Agent desk** → Submit Intent
3. Fill in:
   - Payee: the Payee address
   - Amount: `0.05` USDC (below the 0.10 cap)
   - Service ref: any identifier (e.g. `api.example.com/query`)
   - Deadline: any future timestamp
4. Submit — because amount ≤ cap AND payee is allowlisted → **instant lane fires**, USDC arrives at payee immediately

### Step 6 — Submit an escrow intent

1. Repeat step 5 but use `0.50` USDC (above the 0.10 cap)
2. This routes to **escrow lane** — USDC is locked, status = Locked
3. Switch back to the **Sponsor** wallet, go to **Escrow**
4. Find the locked intent, click **Release** and optionally enter a proof hash
5. USDC transfers to payee

### Step 7 — Create a schedule

1. Switch to Sponsor wallet, go to **Schedules**
2. Create a new schedule: payee, `0.10` USDC, Weekly, starting now
3. Any wallet can click **Execute due schedules** after 7 days (or in a test, warp time)

### Step 8 — Verify on-chain

All transactions are visible on the Arc explorer:
- Factory: https://explorer.arc.io/address/0x8E0514894b72A0629531473E5fD8AEd6dee88861
- Your vault: shown in the Demo tab after creation

---

## Project structure

```
helm/
├── contracts/
│   ├── HelmVault.sol              # Core vault contract
│   ├── HelmVaultFactory.sol       # Factory — deploys vaults
│   ├── test/
│   │   └── HelmVault.t.sol        # 106 Foundry unit tests
│   ├── test-helpers/
│   │   └── MockERC20.sol          # ERC-20 mock for tests
│   └── script/
│       └── DeployHelm.s.sol       # Foundry deploy script
├── src/
│   ├── App.tsx                    # Root — layout shell + tab routing
│   ├── config.ts                  # Chain ID, wagmi config
│   ├── index.css                  # Design tokens + global styles
│   ├── components/
│   │   ├── TopBar.tsx             # Header with wallet connect
│   │   ├── SideNav.tsx            # Left nav (always visible)
│   │   ├── Card.tsx               # Shared card, stat, button, input components
│   │   ├── OverviewPanel.tsx      # Vault balance, deposit, withdraw
│   │   ├── PolicyPanel.tsx        # Auto-approve cap, daily limit, allowlist
│   │   ├── AgentPanel.tsx         # Executors + submit intent
│   │   ├── EscrowPanel.tsx        # View + act on locked intents
│   │   ├── SchedulesPanel.tsx     # Create + execute schedules
│   │   ├── ActivityPanel.tsx      # Live on-chain event log
│   │   └── DemoPanel.tsx          # Step-by-step demo walkthrough
│   └── lib/
│       ├── helm-contracts.ts      # ABIs + factory address
│       ├── useVault.ts            # Wagmi hooks for vault state
│       └── format.ts              # USDC formatting helpers
├── foundry.toml                   # Foundry config (Paris EVM, Arc RPC)
├── remappings.txt                 # Solidity import remappings
├── package.json                   # Bun scripts
└── README.md                      # This file
```

---

## Local development

### Prerequisites

- [Bun](https://bun.sh) v1.x
- [Foundry](https://getfoundry.sh) (forge + cast)
- A wallet with USDC on Arc mainnet for live testing

### Setup

```bash
# Clone the repo
git clone https://github.com/Isaaco3349/Helm.git
cd Helm

# Install JS dependencies
bun install

# Install Foundry dependencies
forge install

# Copy env template
cp .env.example .env
# Edit .env — set VITE_HELM_FACTORY_ADDRESS
```

### Environment variables

```bash
# .env
VITE_HELM_FACTORY_ADDRESS=0x8E0514894b72A0629531473E5fD8AEd6dee88861
```

### Run the dev server

```bash
bun run dev
# App available at http://localhost:5173
```

### Lint and typecheck

```bash
bun run check
```

---

## Running tests

The full test suite runs with Foundry. No network connection required — tests use a mock ERC-20.

```bash
# Run all tests
forge test

# Run with verbose output
forge test -vvv

# Run with gas report
forge test --gas-report

# Run a specific test
forge test --match-test test_SubmitIntent_InstantLane -vvv
```

**Test coverage:**
- 106 tests, 0 failures
- Happy paths, revert paths, events, and fuzzing for all major functions
- Invariant: vault USDC balance always ≥ sum of all Locked intent amounts
- Fuzz: deposit/withdraw cycle, intent balance correctness (256 runs each)

---

## Deploying your own instance

### Prerequisites

- Foundry installed
- A wallet with USDC on Arc mainnet (for gas)
- The repo cloned locally

### Deploy

```bash
# Set your private key (never commit this)
export PRIVATE_KEY=0x...your_key...

# Deploy HelmVaultFactory
forge script contracts/script/DeployHelm.s.sol \
  --rpc-url https://rpc.arc.io \
  --broadcast \
  --private-key $PRIVATE_KEY \
  -vvv
```

The script prints the factory address. Set it in `.env`:

```bash
VITE_HELM_FACTORY_ADDRESS=0x<your factory address>
```

### Build and serve the frontend

```bash
bun run build
# Deploy dist/ to Vercel, Netlify, or any static host
```

---

## Security review summary

A balanced-severity security review was conducted before deployment. Five findings were resolved:

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | High | `usdc` address mutable in both contracts | Made `immutable` in constructor |
| 2 | High | `executeDueSchedules` unbounded loop | Added `MAX_BATCH = 50` constant cap |
| 3 | High | Daily spend limit not enforced on escrow releases | Added `_consumeDailySpend` in `approveIntent` + `releaseIntent` |
| 4 | High | Daily spend limit not enforced on schedule lane | Added inline daily-cap check with `continue` semantics in schedule loop |
| 5 | Low | Dead `require(_owner != address(0))` (OZ Ownable already validates) | Removed dead code |

No critical findings. No upgrade mechanism (immutable by design). No oracle dependencies.

---

## FAQ

**Q: Why Arc mainnet instead of Ethereum or Base?**  
A: Arc uses USDC as its native gas token. This means agents pay for their own transactions in USDC — no ETH juggling, no gas token bridging. Transaction fees are stable and predictable, which matters for automated payment flows.

**Q: Can an agent drain the vault?**  
A: No. An agent wallet (executor) can only _request_ payments via `submitIntent`. It cannot call `withdraw`, change policy, or access funds directly. Even instant-lane payments require the payee to be on the owner's allowlist and the amount to be within the per-transaction cap.

**Q: What happens to USDC in a locked escrow intent if the owner never acts?**  
A: The USDC stays in the vault. After the `deadline` passes, the owner can call `refundIntent` and the intent is marked Refunded — the USDC is released back into the vault's general balance.

**Q: Is there a fee?**  
A: No. Helm is a self-hosted vault — you deploy your own instance and there is no protocol fee. The only costs are Arc mainnet gas (paid in USDC, typically < $0.001 per transaction).

**Q: Can multiple agents share one vault?**  
A: Yes. The owner can add as many executor addresses as needed via `addExecutor`. Each executor submits intents independently; all intents go into the same vault and are governed by the same policy.

**Q: Can the owner change the USDC address?**  
A: No. The USDC address is `immutable` — set once at vault creation, hardcoded to Arc's predeploy address. This is intentional and prevents accidental or malicious token substitution.

**Q: What is a `serviceRef`?**  
A: A `bytes32` field the executor sets to identify the service being paid. Typically `keccak256("api.example.com/endpoint")` or any identifier your agent generates. It appears in the `IntentLocked` / `IntentInstantPaid` event for off-chain indexing and audit.

**Q: What is a `proofHash`?**  
A: An optional field set by the owner when releasing an escrowed intent via `releaseIntent`. It's a `bytes32` commitment to a delivery proof — e.g. `keccak256(receiptJSON)`, a content hash, or a job ID hash. It's emitted in the `IntentReleased` event and can be verified off-chain. Approving via `approveIntent` skips proof and leaves `proofHash` as zero.

**Q: How does the daily spend limit work across lanes?**  
A: All three lanes consume from the same daily bucket. The bucket resets every 86,400 seconds (midnight UTC is approximate — it's `floor(block.timestamp / 86400)`). Instant lane and escrow releases revert if the limit would be exceeded. Schedule lane skips (does not revert) if the limit would be exceeded — it retries on the next `executeDueSchedules` call.

**Q: Can I use Helm on testnet?**  
A: Yes — the same contracts and frontend work on Arc Testnet (Chain ID 5042002). Deploy a new factory using the same script pointed at `https://rpc.testnet.arc.io`. The USDC address is the same predeploy on testnet.

**Q: Why is `executeDueSchedules` permissionless?**  
A: By design. The owner may not be online when a schedule is due. Any wallet — a keeper bot, the payee themselves, or a public automation service — can trigger schedule execution. The owner retains control by cancelling the schedule at any time via `cancelSchedule`.

---

## License

MIT — see [LICENSE](LICENSE).

---

*Built with [Arc Studio](https://studio.arc.io) — money-powered onchain apps in minutes.*
