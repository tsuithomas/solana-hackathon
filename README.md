# Solana Sentinel

> **AI-Powered DeFi Risk Firewall, Natural-Language Execution Engine & On-Chain Audit Vault**
> Built for the **MLH Solana Hackathon** — Competing in **Overall**, **AI Track**, and **DeFi Track**.

---

## 1. Problem Statement

Retail DeFi users and autonomous AI agents face two existential risks when transacting on-chain:

1. **Blind-Signing & Wallet Drainers:** Phishing dApps disguise malicious SPL Token `SetAuthority(AccountOwner)` hijacks, unlimited `Approve(u64::MAX)` delegations, and `SystemProgram::Assign` account takeovers inside seemingly benign claim or swap payloads. Once signed, asset loss is instantaneous and irreversible.
2. **Unbounded AI Agent Execution:** Autonomous DeFi agents translating natural-language intents into transactions lack deterministic, cryptographically enforced spending caps and immutable audit logs. On high-gas L1s, recording an on-chain SHA-256 intent hash and risk score on every micro-transaction would cost $3–$25 in gas—making per-transaction AI accountability economically impossible.

**Solana Sentinel** solves both problems in one cohesive command center: every natural-language command or raw transaction payload undergoes **real Pre-Flight Solana RPC Simulation (`simulateTransaction`) + Bytecode Threat Inspection**, receives a `0–100` AI Risk Verdict, and enforces spending + risk invariants atomically on **Solana Devnet** with cryptographic PDA/Memo audit logging.

---

## 2. How It Uses Solana (Why Only Possible on Solana)

| Capability | How Solana Sentinel Implements It | Why Solana Is Essential |
| :--- | :--- | :--- |
| **Custom Anchor Vault (`sentinel_vault`)** | Derives deterministic `[b"policy", authority]` `GuardPolicy` PDAs storing `max_tx_lamports`, `require_ai_audit`, `whitelisted_programs`, and `safe_tx_count`. Rejects risky txs (`ai_risk_score > 30`) on-chain with `SentinelError::RiskScoreTooHigh` before CPI transfer. | ~400ms slot times and `$0.00025` base fees allow storing and updating cryptographic AI risk telemetry on every single micro-transfer. |
| **Real Pre-Flight SVM Simulation** | Executes `connection.simulateTransaction` (`sigVerify: false`, `replaceRecentBlockhash: true`) on Devnet and inspects compiled instruction discriminators (`SystemProgram`, `SPL Token`, `SPL Memo`), compute units (`unitsConsumed`), and balance deltas before user signature. | Solana's parallel Sealevel runtime exposes deterministic account read/write sets and instruction discriminators upfront. |
| **Zero-Setup Devnet Audit Fallback** | Works 100% out-of-the-box on Solana Devnet via `SystemProgram.transfer` + signer-verified `SPL Memo v2` (`MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`) committing `SENTINEL_V1\|score=<u8>\|cap=<u64>\|pda=<pda>\|intent=<sha256>`, and upgrades seamlessly to Anchor CPI once `anchor deploy` is run. | Judges can test real Devnet transactions with live Solana Explorer links in under 30 seconds without local validator setup. |
| **Solana Pay Instant Settlement** | Encodes canonical `solana:<recipient>?amount=...&reference=<ephemeralPubkey>&label=Sentinel+DeFi` QR invoices via `@solana/pay` and polls Devnet with `findReference` every 2.5s for real-time finality. | Instant consumer/DAO bounty splits with zero intermediary merchant fees. |

---

## 3. System Architecture (Mermaid)

```mermaid
flowchart TB
    subgraph Client["Next.js 14 Institutional Terminal (#0B0F17)"]
        UI["Natural-Language Command Center\n+ 3 One-Click Judge Demo Scenarios"]
        WA["@solana/wallet-adapter-react\n(Phantom / Solflare + In-Browser Judge Signer)"]
        VC["AI Security Verdict Card\n(0-100 Gauge • Balance Deltas • Threat Flags)"]
        SP["Solana Pay QR Generator\n+ Real-Time Reference Poller"]
        AT["Live On-Chain Audit Trail\n(?cluster=devnet Explorer Links)"]
    end

    subgraph Backend["/api/agent Execution & Risk Engine"]
        NLP["Hybrid AI Intent Parser\n(OpenAI / Gemini + Deterministic Zero-Key Fallback)"]
        SCAN["Bytecode & Authority Scanner\n(Detects SPL Approve u64::MAX, SetAuthority, Policy Caps)"]
        SIM["Pre-Flight SVM Simulator\n(connection.simulateTransaction on Devnet)"]
    end

    subgraph SolanaDevnet["Solana Devnet"]
        RPC["Solana Devnet RPC\n(TPS • Block Height • Faucet • Simulation)"]
        ANCHOR["Custom Anchor Program: sentinel_vault\nPDA: [b'policy', authority]\ninitialize_policy / execute_guarded_transfer"]
        MEMO["SPL Memo v2 Audit Log\n(Signer-Verified SHA-256 Intent Hash + Risk Score)"]
        PAY["Solana Pay Reference Index\n(findReference Finality Detection)"]
    end

    UI -->|Natural Language Prompt| NLP
    NLP -->|Structured Action JSON| SCAN
    SCAN -->|Unsigned VersionedTransaction| SIM
    SIM <-->|simulateTransaction| RPC
    SIM -->|SecurityVerdict + CU + Logs| VC
    NLP -->|SOLANA_PAY_REQUEST| SP
    SP <-->|Poll Reference Key| PAY
    VC -->|Sign & Execute (if Risk <= 30)| WA
    WA -->|Signed Devnet Tx| ANCHOR
    WA -->|Signed Devnet Tx| MEMO
    ANCHOR -->|Confirmed Signature| AT
    MEMO -->|Confirmed Signature| AT
```

---

## 4. Repository Structure

```text
solana-hackathon/
├── Anchor.toml                        # Anchor 0.30.1 workspace config targeting Solana Devnet
├── Cargo.toml                         # Rust workspace manifest
├── programs/
│   └── sentinel_vault/
│       ├── Cargo.toml                 # Anchor smart contract crate manifest
│       └── src/lib.rs                 # Custom Anchor program (GuardPolicy PDA, CPI transfer, AuditLogged)
├── app/
│   ├── api/agent/route.ts             # AI Intent Parser + Real Devnet simulateTransaction analyzer
│   ├── globals.css                    # Institutional dark-mode (#0B0F17, #14F195, #9945FF) styles
│   ├── layout.tsx                     # Root layout with SolanaWalletProvider
│   └── page.tsx                       # Interactive Command Center, Policy Vault & Audit Trail
├── components/
│   ├── providers/SolanaWalletProvider.tsx
│   ├── JudgeDemoBar.tsx               # Devnet TPS/Block badge, 1-Click Faucet, 3 Preset Scenarios
│   ├── RiskVerdictCard.tsx            # 0-100 Risk Gauge, Balance Deltas, Threat Scanner, Sign CTA
│   ├── SolanaPayModalCard.tsx         # @solana/pay QR SVG + 2.5s Devnet findReference poller
│   ├── GuardPolicyPanel.tsx           # Deterministic PDA viewer, spending cap slider, policy sync
│   └── AuditTrailTable.tsx            # Live On-Chain Audit Trail with Devnet Explorer links
├── lib/
│   ├── ai/intentParser.ts             # OpenAI / Gemini + Deterministic zero-key local fallback parser
│   ├── solana/
│   │   ├── anchorClient.ts            # GuardPolicy PDA derivation & Anchor Borsh instruction builders
│   │   ├── constants.ts               # Verified Ed25519 keys, program IDs & Explorer URL helpers
│   │   ├── idl/sentinel_vault.ts      # Canonical Anchor 0.30.1 TypeScript IDL
│   │   ├── simulator.ts               # Bytecode threat scanner + live RPC simulateTransaction engine
│   │   ├── solanaPay.ts               # @solana/pay URI encoding, SVG QR rendering & settlement check
│   │   └── txBuilder.ts               # Dual-mode Anchor CPI + Zero-Dependency SPL Memo tx builder
│   └── types/sentinel.ts              # Strict end-to-end TypeScript interfaces
├── scripts/verify-mvp.ts              # Automated Devnet RPC & security firewall verification script
└── tests/sentinel_vault.ts            # Anchor IDL & Borsh discriminator specification tests
```

---

## 5. Step-by-Step Local & Devnet Testing Guide (2-Minute Judge Setup)

### Prerequisites
- **Node.js 18+** and **npm**
- *(Optional)* Phantom or Solflare browser wallet set to **Devnet** — **not required!** Solana Sentinel includes a built-in **In-Browser Judge Burner Signer** so you can airdrop, sign, and verify real Devnet transactions immediately even in a clean browser without wallet extensions.
- *(Optional)* `OPENAI_API_KEY` or `GEMINI_API_KEY` in `.env.local` — **not required!** Includes a full deterministic local DeFi parser out-of-the-box.

### 1. Install & Launch the Web App
```bash
npm install
cp .env.example .env.local   # Optional: works out-of-the-box with zero env vars
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)**.

### 2. Run Automated End-to-End Devnet Verification
```bash
npm run typecheck
npm run verify
```
This runs live pre-flight simulations against `https://api.devnet.solana.com`, verifies PDA derivation and Anchor Borsh discriminators, confirms Scenario A passes (`8/100 SAFE`), confirms Scenario B blocks the `SetAuthority` + `Approve(u64::MAX)` drainer (`96/100 BLOCKED`), and validates `@solana/pay` QR generation.

### 3. Test the 3 One-Click Judge Demo Scenarios in the UI
1. **Fund Active Signer (Optional for Live Broadcast):** Click **`Airdrop 1 SOL`** in the top utility bar (if the public Devnet RPC rate-limits with HTTP 429, click the 1-click Copy Address pill and paste into [faucet.solana.com](https://faucet.solana.com/), or test Pre-Flight RPC Simulation immediately at `0 SOL`).
2. **Click `Scenario A: Safe AI Payment (0.01 SOL • 8/100)`:**
   - Parses the natural-language transfer, simulates on Solana Devnet, displays exact SOL outflow (`-0.010005 SOL`), and unlocks **`Sign & Execute On-Chain (Devnet)`**.
   - Click **`Sign & Execute On-Chain (Devnet)`** to broadcast a real transaction with your SHA-256 intent hash and click **`View on Solana Explorer (Devnet)`** in the On-Chain Audit Trail!
3. **Click `Scenario B: Malicious Drainer Blocked (96/100)`:**
   - Constructs a multi-instruction exploit (`SPL Token Approve(u64::MAX)` + `SetAuthority(AccountOwner)` + `2.50 SOL` sweep exceeding your `0.50 SOL` `GuardPolicy` cap).
   - Flags **Risk Score `96/100 (BLOCKED)`**, surfaces all critical threat vectors in plain English, hard-locks signing with `SentinelError::RiskScoreTooHigh (0x1770)`, and logs the blocked attempt.
4. **Click `Scenario C: Instant Solana Pay QR Invoice`:**
   - Generates a scannable `@solana/pay` QR code (`solana:<recipient>?amount=0.05&reference=...`) and polls Solana Devnet every 2.5s. Click **`Settle 0.05 SOL Invoice from Active Wallet`** (or scan with Phantom Mobile on Devnet) to watch real-time confirmation!

### 4. *(Optional)* Build & Deploy the Custom Rust Anchor Program to Devnet
The frontend works out-of-the-box on Devnet before deploying Anchor, and automatically upgrades to `ANCHOR_CPI` mode as soon as `sentinel_vault` is live at your configured Program ID:
```bash
anchor build
solana config set --url devnet
anchor deploy --provider.cluster devnet
```

---

## 6. 2-Minute Demo Video Script (For MLH Submission)

- **`0:00 – 0:20` | The Hook & Problem:**
  *"Every week, millions in crypto are lost to blind-signed `SetAuthority` wallet drainers, while autonomous AI DeFi agents still have zero on-chain guardrails. Meet **Solana Sentinel**: an AI-Powered DeFi Risk Firewall, Natural-Language Execution Engine, and On-Chain Audit Vault built on Solana Devnet."*
- **`0:20 – 0:50` | Why Solana + Live Telemetry & Scenario A (Safe AI Execution):**
  *"Look at our top institutional bar: we're connected live to Solana Devnet tracking real-time TPS, block height, and our deterministic `GuardPolicy` PDA. Let's click **Scenario A (Safe AI Payment)**. Sentinel parses our natural-language command, runs a live `simulateTransaction` call on Devnet, verifies zero hidden token approvals, scores the risk at **8/100**, and unlocks signing. One click commits the transfer plus our SHA-256 intent hash on-chain in 400 milliseconds for a fraction of a cent—here is the live transaction on **Solana Explorer Devnet**!"*
- **`0:50 – 1:25` | Scenario B (Stopping a Wallet Drainer Cold):**
  *"Now watch what happens when a malicious dApp sneaks an unlimited SPL `Approve` and `SetAuthority(AccountOwner)` takeover inside a claim transaction. We click **Scenario B**. Sentinel inspects the compiled instruction discriminators, detects both the ownership hijack and our `0.50 SOL` GuardPolicy cap violation, spikes the gauge to **96/100 CRITICAL**, and hard-locks execution—matching our custom Rust Anchor `SentinelError::RiskScoreTooHigh` invariant in `lib.rs`."*
- **`1:25 – 1:50` | Scenario C (Instant Solana Pay Settlement):**
  *"Need instant bounty settlement? Click **Scenario C**. Sentinel generates a canonical **Solana Pay** QR request with an ephemeral Ed25519 reference key and polls Devnet every 2.5 seconds. Settling from mobile or right inside our browser flips the invoice to **SETTLED ON DEVNET** automatically and appends the Explorer link to our On-Chain Audit Trail."*
- **`1:50 – 2:00` | Closing:**
  *"Sub-second AI pre-flight security, custom Anchor PDA guardrails, and sub-cent on-chain auditability—only possible on Solana. Thank you!"*
