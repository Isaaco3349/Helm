/**
 * LandingExtra — "How It Works" + FAQ sections rendered on the Demo tab
 * below the step-by-step walkthrough.
 */

const ACCENT = 'var(--accent)'
const SURFACE = 'var(--surface)'
const TEXT = 'var(--text)'
const MUTED = 'var(--text-muted)'
const BORDER = 'var(--border)'
const HEADER_BG = 'var(--header-bg)'
const HEADER_FG = 'var(--header-fg)'

interface StepCardProps {
  number: string
  title: string
  body: string
  tag?: string
}

function StepCard({ number, title, body, tag }: StepCardProps) {
  return (
    <div style={{
      background: SURFACE,
      border: `1px solid ${BORDER}`,
      borderRadius: '10px',
      padding: '1.25rem',
      display: 'flex',
      gap: '1rem',
    }}>
      <div style={{
        flexShrink: 0,
        width: '2.25rem',
        height: '2.25rem',
        borderRadius: '50%',
        background: HEADER_BG,
        color: HEADER_FG,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: '1rem',
      }}>{number}</div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: '0.95rem', color: TEXT }}>{title}</span>
          {tag && (
            <span style={{
              fontSize: '0.65rem',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              padding: '2px 7px',
              borderRadius: '99px',
              background: ACCENT,
              color: HEADER_FG,
            }}>{tag}</span>
          )}
        </div>
        <p style={{ fontSize: '0.875rem', color: MUTED, lineHeight: 1.6, margin: 0 }}>{body}</p>
      </div>
    </div>
  )
}

interface LaneCardProps {
  name: string
  color: string
  trigger: string
  action: string
  example: string
}

function LaneCard({ name, color, trigger, action, example }: LaneCardProps) {
  return (
    <div style={{
      background: SURFACE,
      border: `1px solid ${BORDER}`,
      borderRadius: '10px',
      overflow: 'hidden',
    }}>
      <div style={{ background: color, padding: '0.6rem 1rem' }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.85rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{name}</span>
      </div>
      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED }}>Triggers when</span>
          <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: TEXT }}>{trigger}</p>
        </div>
        <div>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED }}>What happens</span>
          <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: TEXT }}>{action}</p>
        </div>
        <div>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED }}>Example</span>
          <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: TEXT, fontStyle: 'italic' }}>{example}</p>
        </div>
      </div>
    </div>
  )
}

interface FaqItemProps {
  q: string
  a: string
}

function FaqItem({ q, a }: FaqItemProps) {
  return (
    <div style={{
      borderBottom: `1px solid ${BORDER}`,
      padding: '1rem 0',
    }}>
      <p style={{ margin: '0 0 0.4rem', fontWeight: 600, fontSize: '0.9rem', color: TEXT }}>{q}</p>
      <p style={{ margin: 0, fontSize: '0.85rem', color: MUTED, lineHeight: 1.65 }}>{a}</p>
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontFamily: 'var(--font-display)',
      fontSize: '1.35rem',
      fontWeight: 700,
      color: TEXT,
      margin: '0 0 0.25rem',
    }}>{children}</h2>
  )
}

function SectionSubtitle({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: '0 0 1.25rem', fontSize: '0.9rem', color: MUTED, lineHeight: 1.6 }}>{children}</p>
  )
}

export function HowItWorks() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <SectionHeading>How Helm works</SectionHeading>
        <SectionSubtitle>
          Helm puts a policy layer between your USDC and the agents that spend it.
          Every payment goes through one of three lanes — automatically, on-chain, with no intermediary.
        </SectionSubtitle>
      </div>

      <StepCard
        number="1"
        title="Sponsor creates a vault"
        tag="Owner"
        body="Connect your wallet on Arc mainnet and deploy a personal HelmVault from the factory. Your vault is yours alone — a self-custodied smart contract where you hold the keys."
      />
      <StepCard
        number="2"
        title="Deposit USDC and set policy"
        tag="Owner"
        body="Fund the vault with USDC and configure your rules: a per-transaction auto-approve cap, an optional daily spend limit, and a list of trusted payee addresses. Policy lives on-chain — agents cannot override it."
      />
      <StepCard
        number="3"
        title="Approve agent wallets as executors"
        tag="Owner"
        body="Add the EOA wallet addresses of your agents or automation scripts to the executor list. Executors can submit payment requests but cannot withdraw funds, change policy, or act outside their approved scope."
      />
      <StepCard
        number="4"
        title="Agent submits a PaymentIntent"
        tag="Agent"
        body="The agent calls submitIntent with the payee address, USDC amount, a service reference (e.g. keccak256 of an API endpoint), and a deadline. Helm evaluates the intent against policy in the same transaction."
      />
      <StepCard
        number="5"
        title="Helm routes through the correct lane"
        tag="Contract"
        body="Three possible outcomes: Instant (pays immediately), Escrow (locks USDC until owner acts), or Schedule (runs on a timer). The contract enforces this atomically — no off-chain oracle, no multisig delay."
      />
      <StepCard
        number="6"
        title="Owner reviews and releases escrow"
        tag="Owner"
        body="Locked intents appear in the Escrow tab. The owner releases with an optional proof hash (a keccak256 commitment to delivery evidence), approves without proof, cancels, or refunds after the deadline."
      />

      {/* Lane diagram */}
      <div style={{ marginTop: '0.5rem' }}>
        <p style={{ margin: '0 0 0.75rem', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: MUTED }}>The three lanes</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
          <LaneCard
            name="Instant"
            color="#1b5e40"
            trigger="Amount ≤ cap AND payee is allowlisted AND daily limit has room"
            action="USDC transfers immediately to payee in the same transaction"
            example="$0.05 API call to a trusted inference endpoint"
          />
          <LaneCard
            name="Escrow"
            color="#5c564c"
            trigger="Any instant condition fails (too large, unknown payee, limit reached)"
            action="USDC is locked in vault. Owner must release, approve, cancel, or refund"
            example="$2.00 data job to a new vendor not yet on the allowlist"
          />
          <LaneCard
            name="Schedule"
            color="#262c34"
            trigger="block.timestamp ≥ nextRunAt on an active ScheduledPayment"
            action="Any wallet triggers execution. USDC transfers, nextRunAt advances by interval"
            example="Monthly $50 retainer to a contracted model fine-tuning service"
          />
        </div>
      </div>
    </div>
  )
}

export function FAQ() {
  const faqs: FaqItemProps[] = [
    {
      q: 'Why Arc mainnet instead of Ethereum or Base?',
      a: 'Arc uses USDC as its native gas token. Agents pay for their own transactions in USDC — no ETH juggling, no gas token bridging. Fees are stable and predictable, which matters for automated payment flows where cost variance would break accounting.',
    },
    {
      q: 'Can an agent drain the vault?',
      a: 'No. An executor wallet can only submit PaymentIntents — it cannot call withdraw, change policy, or access funds directly. Even instant-lane payments require the payee to be on the owner\'s allowlist and the amount to be within the per-transaction cap.',
    },
    {
      q: 'What happens to USDC in a locked escrow intent if the owner never acts?',
      a: 'The USDC stays in the vault. After the deadline the owner calls refundIntent and the intent is marked Refunded. The USDC returns to the vault\'s general balance for future use.',
    },
    {
      q: 'Is there a protocol fee?',
      a: 'No. Helm is a self-hosted vault — you deploy your own instance and there is no protocol fee. The only costs are Arc mainnet gas (paid in USDC, typically less than $0.001 per transaction).',
    },
    {
      q: 'Can multiple agents share one vault?',
      a: 'Yes. The owner adds as many executor addresses as needed via addExecutor. Each executor submits intents independently; all intents are governed by the same policy and draw from the same vault balance.',
    },
    {
      q: 'Can the USDC address be changed after deployment?',
      a: 'No. The USDC address is declared immutable in both contracts — set once at vault creation, hardcoded to Arc\'s native predeploy address. This prevents accidental or malicious token substitution.',
    },
    {
      q: 'What is a serviceRef?',
      a: 'A bytes32 field the executor sets to identify the service being paid — typically keccak256("api.example.com/endpoint") or any identifier your agent generates. It is emitted in the IntentLocked / IntentInstantPaid event for off-chain indexing and audit trails.',
    },
    {
      q: 'What is a proofHash?',
      a: 'An optional bytes32 commitment to a delivery proof set by the owner when releasing an escrowed intent. For example keccak256(receiptJSON) or a job ID hash. It is emitted in IntentReleased and can be verified off-chain. Approving via approveIntent skips proof.',
    },
    {
      q: 'How does the daily spend limit work across all lanes?',
      a: 'All three lanes consume from the same daily bucket (resets every 86,400 seconds). Instant lane and escrow releases revert if the limit would be exceeded. The schedule lane skips (does not revert) if the limit would be exceeded — it retries on the next executeDueSchedules call.',
    },
    {
      q: 'Why is executeDueSchedules permissionless?',
      a: 'The owner may not be online when a schedule is due. Any wallet — a keeper bot, the payee themselves, or a public automation service — can trigger execution. The owner retains control by cancelling the schedule at any time via cancelSchedule.',
    },
    {
      q: 'Can I use Helm on testnet first?',
      a: 'Yes. The same contracts and frontend work on Arc Testnet (Chain ID 5042002). Deploy a new factory using the same Foundry script pointed at https://rpc.testnet.arc.io. The USDC predeploy address is the same on both networks.',
    },
    {
      q: 'Is the contract upgradeable?',
      a: 'No. HelmVault is immutable by design — no proxy, no admin upgrade key. This means the security model is simple and auditable: once deployed, the rules cannot be changed by anyone, including the deployer.',
    },
  ]

  return (
    <div>
      <SectionHeading>Frequently asked questions</SectionHeading>
      <SectionSubtitle>Everything you need to know about how Helm handles your USDC.</SectionSubtitle>
      <div>
        {faqs.map((faq, i) => (
          <FaqItem key={i} q={faq.q} a={faq.a} />
        ))}
      </div>
    </div>
  )
}
