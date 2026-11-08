# Solana Sentinel

> **AI-Powered DeFi Risk Firewall, Natural-Language Execution Engine & On-Chain Audit Vault**
> Built for the **MLH Solana Hackathon** — Competing in **Overall**, **AI Track**, and **DeFi Track**.

---

## Live Solana Devnet Deployment (Verified On-Chain)

| Artifact | Value |
| :--- | :--- |
| **Anchor Program ID (`sentinel_vault`)** | `D6Fr8JAfScQSQXdjGYvH3R9eSt9ZStavCciw8oRqE3v3` |
| **ProgramData Account** | `4JShtTDqS9qV98s9AyvbQKN6y7j5E57nvLRDABuKrRaC` |
| **Owner / Upgradeable Loader** | `BPFLoaderUpgradeab1e11111111111111111111111` |
| **Deployed Slot & Binary Size** | Slot `#520054121` • `251,464 bytes` (`0x3d648`) |
| **Cluster** | Solana Devnet (`?cluster=devnet`) |

---

## 1. Problem Statement

Retail DeFi users and autonomous AI agents face two existential risks when transacting on-chain:

1. **Blind-Signing & Wallet Drainers:** Phishing dApps disguise malicious SPL Token `SetAuthority(AccountOwner)` hijacks, unlimited `Approve(u64::MAX)` delegations, and `SystemProgram::Assign` account takeovers inside seemingly benign claim or swap payloads. Once signed, asset loss is instantaneous and irreversible.
2. **Unbounded AI Agent Execution:** Autonomous DeFi agents translating natural-language intents into transactions lack deterministic, cryptographically enforced spending caps and immutable audit logs. On high-gas L1s, recording an on-chain SHA-256 intent hash and risk score on every micro-transaction would cost $3–$25 in gas—making per-transaction AI accountability economically impossible.

**Solana Sentinel** solves both problems in one cohesive command center: every natural-language command or raw transaction payload undergoes **real Pre-Flight Solana RPC Simulation (`simulateTransaction`) + Bytecode Threat Inspection**, receives a `0–100` AI Risk Verdict, and enforces spending + risk invariants atomically inside our live **Solana Devnet Anchor Vault (`D6Fr8JAfScQSQXdjGYvH3R9eSt9ZStavCciw8oRqE3v3`)** with cryptographic PDA + SPL Memo audit logging.

---

## 2. How It Uses Solana (Why Only Possible on Solana)

| Capability | How Solana Sentinel Implements It | Why Solana Is Essential |
| :--- | :--- | :--- |
| **Custom Anchor Vault (`sentinel_vault`)** | Live on Solana Devnet (`D6Fr8JAfScQSQXdjGYvH3R9eSt9ZStavCciw8oRqE3v3`, ProgramData `4JShtTDqS9qV98s9AyvbQKN6y7j5E57nvLRDABuKrRaC`, Slot `#520054121`, `251,464 bytes`). Derives deterministic `[b"policy", authority]` `GuardPolicy` PDAs storing `max_tx_lamports`, `require_ai_audit`, `whitelisted_programs`, and `safe_tx_count`, rejecting risky txs (`ai_risk_score > 30`) on-chain with `SentinelError::RiskScoreTooHigh` before CPI transfer. | ~400ms slot times and `$0.00025` base fees allow storing and updating cryptographic AI risk telemetry on every single micro-transfer. |
| **Real Pre-Flight SVM Simulation** | Executes `connection.simulateTransaction` (`sigVerify: false`, `replaceRecentBlockhash: true`) on Devnet and inspects compiled instruction discriminators (`sentinel_vault`, `SystemProgram`, `SPL Token`, `SPL Memo`), compute units (`unitsConsumed`), and balance deltas before user signature. | Solana's parallel Sealevel runtime exposes deterministic account read/write sets and instruction discriminators upfront. |
| **Dual-Mode Anchor CPI + Memo Resilience** | Dispatches `ANCHOR_CPI` (`initialize_policy` / `update_policy` + `execute_guarded_transfer`) directly against `D6Fr8JAfScQSQXdjGYvH3R9eSt9ZStavCciw8oRqE3v3` alongside a signer-verified `SPL Memo v2` (`MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`) audit log, with automatic fallback resilience. | Judges can execute real on-chain PDA-guarded transfers and inspect human-readable audit commitments on Solana Explorer immediately. |
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
        ANCHOR["Deployed Anchor Program: sentinel_vault\nID: D6Fr8JAfScQSQXdjGYvH3R9eSt9ZStavCciw8oRqE3v3\nPDA: [b'policy', authority]"]
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
    WA -->|Anchor CPI + AuditLogged Event| ANCHOR
    WA -->|Signed Audit Commitment| MEMO
    ANCHOR -->|Confirmed Signature| AT
    MEMO -->|Confirmed Signature| AT
```

---

## 4. Repository Structure

```text
solana-hackathon/
├── Anchor.toml                        # Anchor 0.30.1 workspace config (Devnet: D6Fr8JAfScQSQXdjGYvH3R9eSt9ZStavCciw8oRqE3v3)
├── Cargo.toml                         # Rust workspace manifest
├── programs/
│   └── sentinel_vault/
│       ├── Cargo.toml                 # Anchor smart contract crate manifest
│       └── src/lib.rs                 # Deployed Anchor program (GuardPolicy PDA, CPI transfer, AuditLogged)
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
│   │   ├── constants.ts               # Deployed Program ID, verified Ed25519 keys & Explorer helpers
│   │   ├── idl/sentinel_vault.ts      # Canonical Anchor 0.30.1 TypeScript IDL
│   │   ├── simulator.ts               # Bytecode threat scanner + live RPC simulateTransaction engine
│   │   ├── solanaPay.ts               # @solana/pay URI encoding, SVG QR rendering & settlement check
│   │   └── txBuilder.ts               # Live Anchor CPI + SPL Memo v2 transaction builder
│   └── types/sentinel.ts              # Strict end-to-end TypeScript interfaces
├── scripts/
│   ├── deploy-devnet.sh               # Reproducible Anchor 0.30.1 Devnet build & deployment script
│   └── verify-mvp.ts                  # Automated Devnet RPC & security firewall verification script
└── tests/sentinel_vault.ts            # Anchor IDL & Borsh discriminator specification tests
```

---

## 5. Step-by-Step Local & Devnet Testing Guide (2-Minute Judge Setup)

### Prerequisites
- **Node.js 18+ / 20+** and **npm**
- *(Optional)* Phantom or Solflare browser wallet set to **Devnet** — **not required!** Solana Sentinel includes a built-in **In-Browser Judge Burner Signer** so you can airdrop, sign, and verify real Devnet transactions immediately even in a clean browser without wallet extensions.
- *(Optional)* `OPENAI_API_KEY` or `GEMINI_API_KEY` in `.env.local` — **not required!** Includes a full deterministic local DeFi parser out-of-the-box.

### 1. Install & Launch the Web App
```bash
npm install
cp .env.example .env.local   # Optional: defaults directly to live Devnet D6Fr8JAfScQSQXdjGYvH3R9eSt9ZStavCciw8oRqE3v3
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)**.

### 2. Run Automated End-to-End Devnet Verification
```bash
npm run typecheck
npm run verify
```
This runs live pre-flight simulations against `https://api.devnet.solana.com` and the deployed `sentinel_vault` program (`D6Fr8JAfScQSQXdjGYvH3R9eSt9ZStavCciw8oRqE3v3`), verifies PDA derivation and Anchor Borsh discriminators, confirms Scenario A passes (`8/100 SAFE`), confirms Scenario B blocks the `SetAuthority` + `Approve(u64::MAX)` drainer (`96/100 BLOCKED`), and validates `@solana/pay` QR generation.

### 3. Test the 3 One-Click Judge Demo Scenarios in the UI
1. **Fund Active Signer (Optional for Live Broadcast):** Click **`Airdrop 1 SOL`** in the top utility bar (if the public Devnet RPC rate-limits with HTTP 429, click the 1-click Copy Address pill and paste into [faucet.solana.com](https://faucet.solana.com/), or test Pre-Flight RPC Simulation immediately at `0 SOL`).
2. **Click `Scenario A: Safe AI Payment (0.01 SOL • 8/100)`:**
   - Parses the natural-language transfer, simulates `sentinel_vault::execute_guarded_transfer` on Solana Devnet, displays exact SOL outflow (`-0.010005 SOL`), and unlocks **`Sign & Execute On-Chain (Devnet)`**.
   - Click **`Sign & Execute On-Chain (Devnet)`** to initialize/update your `GuardPolicy` PDA and execute the CPI transfer on Devnet (`ANCHOR_CPI`), then click **`View on Solana Explorer (Devnet)`** in the On-Chain Audit Trail!
3. **Click `Scenario B: Malicious Drainer Blocked (96/100)`:**
   - Constructs a multi-instruction exploit (`SPL Token Approve(u64::MAX)` + `SetAuthority(AccountOwner)` + `2.50 SOL` sweep exceeding your `0.50 SOL` `GuardPolicy` cap).
   - Flags **Risk Score `96/100 (BLOCKED)`**, surfaces all critical threat vectors in plain English, hard-locks signing with `SentinelError::RiskScoreTooHigh (0x1770)`, and logs the blocked attempt.
4. **Click `Scenario C: Instant Solana Pay QR Invoice`:**
   - Generates a scannable `@solana/pay` QR code (`solana:<recipient>?amount=0.05&reference=...`) and polls Solana Devnet every 2.5s. Click **`Settle 0.05 SOL Invoice from Active Wallet`** (or scan with Phantom Mobile on Devnet) to watch real-time confirmation!

### 4. Rebuilding or Redeploying the Custom Rust Anchor Program on Devnet
`sentinel_vault` is live and executable on Solana Devnet at `D6Fr8JAfScQSQXdjGYvH3R9eSt9ZStavCciw8oRqE3v3` (deployed in Slot `#520054121`), so the frontend executes in **`Anchor CPI Vault` (`ANCHOR_CPI`)** mode out-of-the-box. To rebuild or redeploy from source with Anchor `0.30.1`:
```bash
bash scripts/deploy-devnet.sh
# Or manually:
anchor build --no-idl
solana config set --url devnet
anchor deploy --provider.cluster devnet
solana program show D6Fr8JAfScQSQXdjGYvH3R9eSt9ZStavCciw8oRqE3v3 --url devnet
```

---

## 6. 2-Minute Demo Video Script (For MLH Submission)

- **`0:00 – 0:20` | The Hook & Problem:**
  *"Every week, millions in crypto are lost to blind-signed `SetAuthority` wallet drainers, while autonomous AI DeFi agents still have zero on-chain guardrails. Meet **Solana Sentinel**: an AI-Powered DeFi Risk Firewall, Natural-Language Execution Engine, and On-Chain Audit Vault deployed on Solana Devnet at `D6Fr8JAfScQSQXdjGYvH3R9eSt9ZStavCciw8oRqE3v3`."*
- **`0:20 – 0:50` | Why Solana + Live Telemetry & Scenario A (Safe AI Execution):**
  *"Look at our top institutional bar: we're connected live to Solana Devnet tracking real-time TPS, block height, and our deterministic `GuardPolicy` PDA (`Execution Mode: Anchor CPI Vault`). Let's click **Scenario A (Safe AI Payment)**. Sentinel parses our natural-language command, runs a live `simulateTransaction` call against our deployed Anchor program on Devnet, verifies zero hidden token approvals, scores the risk at **8/100**, and unlocks signing. One click executes `execute_guarded_transfer`, increments our on-chain PDA audit counter, and emits an `AuditLogged` event in 400 milliseconds for a fraction of a cent—here is the live transaction on **Solana Explorer Devnet**!"*
- **`0:50 – 1:25` | Scenario B (Stopping a Wallet Drainer Cold):**
  *"Now watch what happens when a malicious dApp sneaks an unlimited SPL `Approve` and `SetAuthority(AccountOwner)` takeover inside a claim transaction. We click **Scenario B**. Sentinel inspects the compiled instruction discriminators, detects both the ownership hijack and our `0.50 SOL` GuardPolicy cap violation, spikes the gauge to **96/100 CRITICAL**, and hard-locks execution—enforced on-chain by `SentinelError::RiskScoreTooHigh` in `programs/sentinel_vault/src/lib.rs`."*
- **`1:25 – 1:50` | Scenario C (Instant Solana Pay Settlement):**
  *"Need instant bounty settlement? Click **Scenario C**. Sentinel generates a canonical **Solana Pay** QR request with an ephemeral Ed25519 reference key and polls Devnet every 2.5 seconds. Settling from mobile or right inside our browser flips the invoice to **SETTLED ON DEVNET** automatically and appends the Explorer link to our On-Chain Audit Trail."*
- **`1:50 – 2:00` | Closing:**
  *"Sub-second AI pre-flight security, live Devnet Anchor PDA guardrails, and sub-cent on-chain auditability—only possible on Solana. Thank you!"*
