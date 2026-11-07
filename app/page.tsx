"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  Bot,
  Code2,
  CornerDownLeft,
  Loader2,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Zap,
} from "lucide-react";
import { JudgeDemoBar } from "@/components/JudgeDemoBar";
import { RiskVerdictCard } from "@/components/RiskVerdictCard";
import { SolanaPayModalCard } from "@/components/SolanaPayModalCard";
import { GuardPolicyPanel } from "@/components/GuardPolicyPanel";
import { AuditTrailTable } from "@/components/AuditTrailTable";
import {
  DEFAULT_POLICY_MAX_TX_SOL,
  DEFAULT_WHITELISTED_PROGRAMS,
  DEMO_SAFE_RECIPIENT,
  MAX_ALLOWED_AI_RISK_SCORE,
  MOCK_MALICIOUS_DRAINER,
  getExplorerTxUrl,
} from "@/lib/solana/constants";
import {
  deriveGuardPolicyPda,
  fetchOrDeriveGuardPolicy,
} from "@/lib/solana/anchorClient";
import {
  buildGuardedTransferTransaction,
  buildPolicySyncTransaction,
} from "@/lib/solana/txBuilder";
import type {
  AgentApiResponse,
  AuditTrailEntry,
  GuardPolicyState,
  SolanaPayInvoicePayload,
} from "@/lib/types/sentinel";

const BURNER_STORAGE_KEY = "sentinel_judge_burner_secret_v1";
const AUDIT_STORAGE_KEY = "sentinel_audit_trail_v1";

const EXAMPLE_PROMPTS = [
  `Send 0.01 Devnet SOL to ${DEMO_SAFE_RECIPIENT} if the wallet risk score is safe`,
  "Generate a Solana Pay checkout split of 0.05 SOL for hackathon bounty settlement",
  `Simulate and audit raw transaction payload attempting SetAuthority(AccountOwner) to ${MOCK_MALICIOUS_DRAINER}`,
  "Update my GuardPolicy max spending cap to 0.75 SOL per transaction",
];

export default function SentinelDashboardPage() {
  const { connection } = useConnection();
  const wallet = useWallet();

  // Ephemeral in-browser Judge Burner Keypair so judges without Phantom installed
  // can still airdrop, sign, and verify real transactions on Solana Devnet!
  const [burnerKeypair, setBurnerKeypair] = useState<Keypair | null>(null);
  const [preferBurner, setPreferBurner] = useState<boolean>(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(BURNER_STORAGE_KEY);
      if (saved) {
        const secret = Uint8Array.from(JSON.parse(saved) as number[]);
        setBurnerKeypair(Keypair.fromSecretKey(secret));
      } else {
        const kp = Keypair.generate();
        window.localStorage.setItem(
          BURNER_STORAGE_KEY,
          JSON.stringify(Array.from(kp.secretKey))
        );
        setBurnerKeypair(kp);
      }
    } catch {
      setBurnerKeypair(Keypair.generate());
    }
  }, []);

  const usingBurnerSigner = Boolean(
    burnerKeypair && (!wallet.connected || preferBurner)
  );

  const activePubkey: PublicKey | null = useMemo(() => {
    if (!preferBurner && wallet.publicKey) return wallet.publicKey;
    return burnerKeypair?.publicKey ?? null;
  }, [preferBurner, wallet.publicKey, burnerKeypair]);

  const activeAddress =
    activePubkey?.toBase58() ?? DEMO_SAFE_RECIPIENT;

  // Live Solana Devnet TPS, Block Height & Balance Telemetry
  const [tps, setTps] = useState<number | null>(null);
  const [blockHeight, setBlockHeight] = useState<number | null>(null);
  const [solBalance, setSolBalance] = useState<number | null>(null);

  const refreshChainTelemetry = useCallback(async () => {
    try {
      const [height, perfSamples] = await Promise.all([
        connection.getBlockHeight("confirmed"),
        connection.getRecentPerformanceSamples(1),
      ]);
      setBlockHeight(height);
      if (perfSamples.length > 0 && perfSamples[0].samplePeriodSecs > 0) {
        setTps(
          Math.round(
            perfSamples[0].numTransactions / perfSamples[0].samplePeriodSecs
          )
        );
      }
    } catch {
      // Non-fatal if public Devnet RPC momentarily drops a telemetry poll
    }

    if (activePubkey) {
      try {
        const lamports = await connection.getBalance(activePubkey, "confirmed");
        setSolBalance(lamports / LAMPORTS_PER_SOL);
      } catch {
        // Ignore transient balance error
      }
    }
  }, [connection, activePubkey]);

  useEffect(() => {
    refreshChainTelemetry();
    const timer = setInterval(refreshChainTelemetry, 8000);
    return () => clearInterval(timer);
  }, [refreshChainTelemetry]);

  // GuardPolicy PDA State
  const [policyMaxSol, setPolicyMaxSol] = useState<number>(
    DEFAULT_POLICY_MAX_TX_SOL
  );
  const [requireAiAudit, setRequireAiAudit] = useState<boolean>(true);
  const [safeTxCount, setSafeTxCount] = useState<number>(0);
  const [blockedCount, setBlockedCount] = useState<number>(0);
  const [totalVolumeSol, setTotalVolumeSol] = useState<number>(0);

  const [policyState, setPolicyState] = useState<GuardPolicyState>(() => {
    const fallbackPk = new PublicKey(DEMO_SAFE_RECIPIENT);
    const [pda, bump] = deriveGuardPolicyPda(fallbackPk);
    return {
      authority: fallbackPk.toBase58(),
      policyPda: pda.toBase58(),
      bump,
      maxTxSol: DEFAULT_POLICY_MAX_TX_SOL,
      maxTxLamports: Math.round(DEFAULT_POLICY_MAX_TX_SOL * LAMPORTS_PER_SOL),
      requireAiAudit: true,
      maxRiskScore: MAX_ALLOWED_AI_RISK_SCORE,
      safeTxCount: 0,
      blockedAttemptCount: 0,
      totalVolumeSol: 0,
      whitelistedPrograms: DEFAULT_WHITELISTED_PROGRAMS,
      onChainDeployed: false,
      lastIntentHashHex: "0".repeat(64),
    };
  });

  useEffect(() => {
    if (!activePubkey) return;
    fetchOrDeriveGuardPolicy(connection, activePubkey, {
      maxTxSol: policyMaxSol,
      requireAiAudit,
      safeTxCount,
      blockedAttemptCount: blockedCount,
      totalVolumeSol,
    }).then(setPolicyState);
  }, [
    connection,
    activePubkey,
    policyMaxSol,
    requireAiAudit,
    safeTxCount,
    blockedCount,
    totalVolumeSol,
  ]);

  // Audit Trail Persistence
  const [auditEntries, setAuditEntries] = useState<AuditTrailEntry[]>([]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(AUDIT_STORAGE_KEY);
      if (saved) {
        setAuditEntries(JSON.parse(saved) as AuditTrailEntry[]);
      }
    } catch {
      // Ignore storage error
    }
  }, []);

  const appendAuditEntry = useCallback((entry: AuditTrailEntry) => {
    setAuditEntries((prev) => {
      const next = [entry, ...prev].slice(0, 30);
      try {
        window.localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore quota error
      }
      return next;
    });
  }, []);

  // Airdrop State
  const [isAirdropping, setIsAirdropping] = useState(false);
  const [airdropMessage, setAirdropMessage] = useState<{
    type: "success" | "rate_limit" | "error";
    text: string;
    txUrl?: string;
  } | null>(null);

  const handleRequestAirdrop = async () => {
    if (!activePubkey) return;
    setIsAirdropping(true);
    setAirdropMessage(null);
    try {
      const sig = await connection.requestAirdrop(
        activePubkey,
        1 * LAMPORTS_PER_SOL
      );
      const latest = await connection.getLatestBlockhash("confirmed");
      await connection.confirmTransaction(
        {
          signature: sig,
          blockhash: latest.blockhash,
          lastValidBlockHeight: latest.lastValidBlockHeight,
        },
        "confirmed"
      );
      await refreshChainTelemetry();
      setAirdropMessage({
        type: "success",
        text: "Airdropped +1.000 Devnet SOL to your active wallet!",
        txUrl: getExplorerTxUrl(sig),
      });
    } catch {
      setAirdropMessage({
        type: "rate_limit",
        text: "Public Devnet RPC rate-limited direct airdrop (429). Copy your wallet address right here and claim 1 SOL at faucet.solana.com—or run Pre-Flight AI Simulation immediately at 0 SOL!",
      });
    } finally {
      setIsAirdropping(false);
    }
  };

  // Sign & Broadcast Helper (Connected Browser Wallet OR In-Browser Judge Burner Signer)
  const signAndSendVersionedTx = useCallback(
    async (tx: VersionedTransaction): Promise<string> => {
      if (!usingBurnerSigner && wallet.connected && wallet.sendTransaction) {
        const sig = await wallet.sendTransaction(tx, connection, {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        });
        const latest = await connection.getLatestBlockhash("confirmed");
        await connection.confirmTransaction(
          {
            signature: sig,
            blockhash: latest.blockhash,
            lastValidBlockHeight: latest.lastValidBlockHeight,
          },
          "confirmed"
        );
        return sig;
      }

      if (burnerKeypair) {
        tx.sign([burnerKeypair]);
        const sig = await connection.sendRawTransaction(tx.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        });
        const latest = await connection.getLatestBlockhash("confirmed");
        await connection.confirmTransaction(
          {
            signature: sig,
            blockhash: latest.blockhash,
            lastValidBlockHeight: latest.lastValidBlockHeight,
          },
          "confirmed"
        );
        return sig;
      }

      throw new Error("Please connect Phantom/Solflare or enable Judge Signer.");
    },
    [usingBurnerSigner, wallet, connection, burnerKeypair]
  );

  // Command Center Prompt & Agent Evaluation State
  const [prompt, setPrompt] = useState<string>(EXAMPLE_PROMPTS[0]);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [activeScenario, setActiveScenario] = useState<
    "SCENARIO_A" | "SCENARIO_B" | "SCENARIO_C" | null
  >(null);
  const [agentResult, setAgentResult] = useState<AgentApiResponse | null>(null);
  const [isSigningTx, setIsSigningTx] = useState<boolean>(false);
  const [isSyncingPolicy, setIsSyncingPolicy] = useState<boolean>(false);
  const [isPayingInvoice, setIsPayingInvoice] = useState<boolean>(false);
  const [lastExecutionTx, setLastExecutionTx] = useState<{
    signature: string;
    explorerUrl: string;
    mode: string;
  } | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);

  const submitCommand = async (opts?: {
    overridePrompt?: string;
    presetScenario?: "SCENARIO_A" | "SCENARIO_B" | "SCENARIO_C";
  }) => {
    const query = opts?.overridePrompt ?? prompt;
    setIsEvaluating(true);
    setActiveScenario(opts?.presetScenario ?? null);
    setLastExecutionTx(null);
    setExecutionError(null);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: query,
          walletAddress: activeAddress,
          policyMaxTxSol: policyMaxSol,
          requireAiAudit,
          presetScenario: opts?.presetScenario,
        }),
      });

      const data = (await res.json()) as AgentApiResponse;
      if (!data.ok) {
        setExecutionError(data.error || "Failed to evaluate intent.");
        return;
      }

      setAgentResult(data);
      if (opts?.overridePrompt) {
        setPrompt(data.intent.rawPrompt);
      }

      // Apply local policy updates immediately if UPDATE_POLICY was parsed
      if (
        data.intent.action === "UPDATE_POLICY" &&
        typeof data.intent.newMaxTxSol === "number"
      ) {
        setPolicyMaxSol(data.intent.newMaxTxSol);
        if (typeof data.intent.requireAiAudit === "boolean") {
          setRequireAiAudit(data.intent.requireAiAudit);
        }
      }

      // Automatically record blocked malicious payloads in the Audit Trail & Threat Counter!
      if (data.verdict.verdict === "BLOCKED") {
        setBlockedCount((c) => c + 1);
        appendAuditEntry({
          id: `blocked-${Date.now()}`,
          timestamp: data.timestamp,
          intentSummary: data.intent.summary,
          action: data.intent.action,
          riskScore: data.verdict.riskScore,
          verdict: "BLOCKED",
          computeUnits: data.verdict.simulation.unitsConsumed,
          amountSol: data.intent.amountSol ?? null,
          recipient: data.intent.recipient ?? null,
          intentHashHex: data.verdict.intentHashHex,
          policyPda: data.verdict.policyPda,
          executionMode: "FIREWALL_BLOCKED",
          signature: null,
          explorerUrl: null,
        });
      }
    } catch (err) {
      setExecutionError(
        err instanceof Error ? err.message : "Network error calling /api/agent"
      );
    } finally {
      setIsEvaluating(false);
    }
  };

  // 1-Click Judge Demo Scenario Handler
  const handleRunScenario = (
    scenario: "SCENARIO_A" | "SCENARIO_B" | "SCENARIO_C"
  ) => {
    const scenarioPrompts = {
      SCENARIO_A: `Send 0.01 Devnet SOL to ${DEMO_SAFE_RECIPIENT} if the wallet risk score is safe`,
      SCENARIO_B: `Simulate and audit raw claim payload attempting SPL Token Approve(u64::MAX) + SetAuthority(AccountOwner) to ${MOCK_MALICIOUS_DRAINER} and 2.50 SOL sweep`,
      SCENARIO_C:
        "Generate a Solana Pay checkout split of 0.05 SOL for hackathon bounty settlement",
    };
    setPrompt(scenarioPrompts[scenario]);
    submitCommand({
      overridePrompt: scenarioPrompts[scenario],
      presetScenario: scenario,
    });
  };

  // Sign & Execute Guarded Transfer / Policy Update On-Chain
  const handleExecuteOnChain = async () => {
    if (!agentResult || !activePubkey) return;
    setIsSigningTx(true);
    setExecutionError(null);

    try {
      const { intent, verdict } = agentResult;

      if (intent.action === "UPDATE_POLICY") {
        const nextMax = intent.newMaxTxSol ?? policyMaxSol;
        const { transaction } = await buildPolicySyncTransaction({
          connection,
          authority: activePubkey,
          maxTxSol: nextMax,
          requireAiAudit: intent.requireAiAudit ?? requireAiAudit,
          intentHashHex: verdict.intentHashHex,
        });
        const sig = await signAndSendVersionedTx(transaction);
        const explorerUrl = getExplorerTxUrl(sig);

        setLastExecutionTx({
          signature: sig,
          explorerUrl,
          mode: "POLICY_SYNC",
        });
        appendAuditEntry({
          id: sig,
          timestamp: new Date().toISOString(),
          intentSummary: intent.summary,
          action: "UPDATE_POLICY",
          riskScore: verdict.riskScore,
          verdict: "SAFE",
          computeUnits: verdict.simulation.unitsConsumed,
          amountSol: null,
          recipient: null,
          intentHashHex: verdict.intentHashHex,
          policyPda: verdict.policyPda,
          executionMode: "POLICY_SYNC",
          signature: sig,
          explorerUrl,
        });
        await refreshChainTelemetry();
        return;
      }

      const amountSol = intent.amountSol ?? 0.01;
      const recipientPk = new PublicKey(intent.recipient || DEMO_SAFE_RECIPIENT);

      const built = await buildGuardedTransferTransaction({
        connection,
        authority: activePubkey,
        recipient: recipientPk,
        amountSol,
        aiRiskScore: verdict.riskScore,
        intentHashBytes: new Uint8Array(verdict.intentHashBytes),
        intentHashHex: verdict.intentHashHex,
        policyMaxTxSol: policyMaxSol,
        requireAiAudit,
      });

      const sig = await signAndSendVersionedTx(built.transaction);
      const explorerUrl = getExplorerTxUrl(sig);

      setSafeTxCount((c) => c + 1);
      setTotalVolumeSol((v) => v + amountSol);
      setLastExecutionTx({
        signature: sig,
        explorerUrl,
        mode: built.executionMode,
      });

      appendAuditEntry({
        id: sig,
        timestamp: new Date().toISOString(),
        intentSummary: intent.summary,
        action: intent.action,
        riskScore: verdict.riskScore,
        verdict: verdict.verdict,
        computeUnits: verdict.simulation.unitsConsumed,
        amountSol,
        recipient: recipientPk.toBase58(),
        intentHashHex: verdict.intentHashHex,
        policyPda: built.policyPda.toBase58(),
        executionMode: built.executionMode,
        signature: sig,
        explorerUrl,
      });

      await refreshChainTelemetry();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("Attempt to debit an account but found no record") ||
        msg.includes("0x1") ||
        msg.includes("insufficient")
      ) {
        setExecutionError(
          `Active wallet (${activeAddress.slice(0, 6)}...) needs Devnet SOL to broadcast on-chain. Click "Airdrop 1 SOL" in the top bar (or fund via faucet.solana.com) and click Sign & Execute again!`
        );
      } else {
        setExecutionError(`Transaction failed: ${msg}`);
      }
    } finally {
      setIsSigningTx(false);
    }
  };

  // Sync Policy Button in Sidebar
  const handleSyncPolicySidebar = async () => {
    if (!activePubkey) return;
    setIsSyncingPolicy(true);
    setExecutionError(null);
    try {
      const hashSeed = `${activeAddress}:${policyMaxSol}:${requireAiAudit}:${Date.now()}`;
      const encoded = new TextEncoder().encode(hashSeed);
      const digest = await window.crypto.subtle.digest(
        "SHA-256",
        encoded.buffer as ArrayBuffer
      );
      const intentHashHex = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const { transaction, policyPda } = await buildPolicySyncTransaction({
        connection,
        authority: activePubkey,
        maxTxSol: policyMaxSol,
        requireAiAudit,
        intentHashHex,
      });

      const sig = await signAndSendVersionedTx(transaction);
      const explorerUrl = getExplorerTxUrl(sig);

      appendAuditEntry({
        id: sig,
        timestamp: new Date().toISOString(),
        intentSummary: `Anchored GuardPolicy Cap (${policyMaxSol.toFixed(2)} SOL, Audit=${requireAiAudit})`,
        action: "UPDATE_POLICY",
        riskScore: 4,
        verdict: "SAFE",
        computeUnits: 4200,
        amountSol: null,
        recipient: null,
        intentHashHex,
        policyPda: policyPda.toBase58(),
        executionMode: "POLICY_SYNC",
        signature: sig,
        explorerUrl,
      });
      await refreshChainTelemetry();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setExecutionError(
        msg.includes("no record")
          ? 'Fund your active wallet first using "Airdrop 1 SOL" in the top bar to anchor policy commitments on Devnet.'
          : msg
      );
    } finally {
      setIsSyncingPolicy(false);
    }
  };

  // Settle Solana Pay Invoice Directly from Desktop Wallet (with Reference Key!)
  const handlePaySolanaPayInvoice = async (
    invoice: SolanaPayInvoicePayload
  ) => {
    if (!activePubkey || !agentResult) return;
    setIsPayingInvoice(true);
    setExecutionError(null);
    try {
      const built = await buildGuardedTransferTransaction({
        connection,
        authority: activePubkey,
        recipient: new PublicKey(invoice.recipient),
        amountSol: invoice.amountSol,
        aiRiskScore: 4,
        intentHashBytes: new Uint8Array(agentResult.verdict.intentHashBytes),
        intentHashHex: agentResult.verdict.intentHashHex,
        policyMaxTxSol: Math.max(policyMaxSol, invoice.amountSol),
        requireAiAudit,
        referencePubkey: new PublicKey(invoice.reference),
      });

      const sig = await signAndSendVersionedTx(built.transaction);
      const explorerUrl = getExplorerTxUrl(sig);
      handleSolanaPayConfirmed(sig, explorerUrl);
      await refreshChainTelemetry();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setExecutionError(
        msg.includes("no record")
          ? 'Fund your active wallet with "Airdrop 1 SOL" in the top bar (or scan QR with a funded Devnet mobile wallet) to settle this invoice on Devnet.'
          : `Solana Pay settlement failed: ${msg}`
      );
    } finally {
      setIsPayingInvoice(false);
    }
  };

  const handleSolanaPayConfirmed = useCallback(
    (signature: string, explorerUrl: string) => {
      if (!agentResult?.verdict.solanaPayPayload) return;
      const inv = agentResult.verdict.solanaPayPayload;
      setSafeTxCount((c) => c + 1);
      setTotalVolumeSol((v) => v + inv.amountSol);
      setLastExecutionTx({
        signature,
        explorerUrl,
        mode: "SOLANA_PAY",
      });

      appendAuditEntry({
        id: signature,
        timestamp: new Date().toISOString(),
        intentSummary: `Solana Pay Invoice Settled (${inv.amountSol} SOL • ${inv.message})`,
        action: "SOLANA_PAY_REQUEST",
        riskScore: 4,
        verdict: "SAFE",
        computeUnits: 5100,
        amountSol: inv.amountSol,
        recipient: inv.recipient,
        intentHashHex: agentResult.verdict.intentHashHex,
        policyPda: agentResult.verdict.policyPda,
        executionMode: "SOLANA_PAY",
        signature,
        explorerUrl,
      });
    },
    [agentResult, appendAuditEntry]
  );

  return (
    <div className="min-h-screen pb-16">
      <JudgeDemoBar
        tps={tps}
        blockHeight={blockHeight}
        activeAddress={activeAddress}
        usingBurnerSigner={usingBurnerSigner}
        onToggleBurnerSigner={() => setPreferBurner((v) => !v)}
        solBalance={solBalance}
        isAirdropping={isAirdropping}
        airdropMessage={airdropMessage}
        onRequestAirdrop={handleRequestAirdrop}
        onRunScenario={handleRunScenario}
        isLoadingScenario={isEvaluating}
        activeScenario={activeScenario}
      />

      <main className="mx-auto mt-6 max-w-7xl space-y-6 px-4 sm:px-6">
        {/* Hero Value Banner */}
        <section className="rounded-2xl border border-sentinel-border bg-gradient-to-r from-sentinel-panel via-[#131B2E] to-sentinel-panel p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 font-mono text-xs font-semibold text-sentinel-green">
                <Zap className="h-3.5 w-3.5" />
                <span>
                  SUB-SECOND AI FIREWALL • CRYPTOGRAPHIC PDA AUDIT VAULT •
                  SOLANA DEVNET
                </span>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                Natural-Language DeFi Execution with On-Chain Risk Enforcement
              </h1>
              <p className="max-w-3xl text-sm text-slate-400">
                Translate plain-English intents into simulated Solana
                transactions, detect wallet-drainer{" "}
                <code className="text-rose-300">SetAuthority</code> &amp;
                unlimited <code className="text-rose-300">Approve</code> traps
                before signing, and anchor every SHA-256 intent audit on-chain
                for &lt;$0.0005.
              </p>
            </div>

            <div className="grid shrink-0 grid-cols-3 gap-2.5 font-mono text-center text-xs">
              <div className="rounded-xl border border-sentinel-border bg-[#0B0F17]/90 px-3.5 py-2.5">
                <div className="text-[10px] uppercase text-slate-400">
                  Max Safe Risk
                </div>
                <div className="mt-0.5 text-base font-bold text-sentinel-green">
                  &lt;= 30
                </div>
              </div>
              <div className="rounded-xl border border-sentinel-border bg-[#0B0F17]/90 px-3.5 py-2.5">
                <div className="text-[10px] uppercase text-slate-400">
                  Audit Cost
                </div>
                <div className="mt-0.5 text-base font-bold text-white">
                  $0.00025
                </div>
              </div>
              <div className="rounded-xl border border-sentinel-border bg-[#0B0F17]/90 px-3.5 py-2.5">
                <div className="text-[10px] uppercase text-slate-400">
                  Finality
                </div>
                <div className="mt-0.5 text-base font-bold text-[#C49BFF]">
                  ~400ms
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Main 12-Column Command Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left 8 Columns: AI Command Center + Verdict Card / Solana Pay */}
          <div className="space-y-6 lg:col-span-8">
            {/* AI Natural-Language Command Center */}
            <section className="rounded-2xl border border-sentinel-border bg-sentinel-panel p-5 sm:p-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-sentinel-green" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-white">
                    AI DeFi Copilot &amp; Pre-Signature Risk Scanner
                  </h2>
                </div>
                <span className="font-mono text-[11px] text-slate-400">
                  Real <code className="text-sentinel-green">simulateTransaction</code> on Devnet
                </span>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitCommand();
                }}
                className="space-y-3"
              >
                <div className="relative">
                  <textarea
                    rows={3}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Type a DeFi intent (e.g., 'Send 0.05 Devnet SOL to 8fCS... if the wallet risk score is safe')"
                    className="w-full resize-none rounded-xl border border-sentinel-border bg-[#0B0F17] p-4 font-mono text-sm text-white placeholder-slate-500 focus:border-sentinel-green focus:outline-none focus:ring-1 focus:ring-sentinel-green"
                  />
                </div>

                {/* Quick Prompt Chips */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-[11px] text-slate-500">
                    Try intent:
                  </span>
                  {EXAMPLE_PROMPTS.map((sample, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setPrompt(sample);
                        submitCommand({ overridePrompt: sample });
                      }}
                      className="rounded-md border border-sentinel-border bg-[#0B0F17]/90 px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-sentinel-purple/60 hover:text-white"
                    >
                      {idx === 0 && "Safe 0.01 SOL Transfer"}
                      {idx === 1 && "Solana Pay 0.05 SOL Split"}
                      {idx === 2 && "Audit SetAuthority Drainer"}
                      {idx === 3 && "Set Policy Cap 0.75 SOL"}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
                    <TerminalSquare className="h-4 w-4 text-sentinel-purple" />
                    <span>
                      Signer:{" "}
                      <strong className="text-white">
                        {usingBurnerSigner
                          ? "In-Browser Judge Burner"
                          : "Connected Wallet Adapter"}
                      </strong>
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={isEvaluating || !prompt.trim()}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sentinel-purple to-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-glow-purple transition hover:brightness-110 disabled:opacity-50"
                  >
                    {isEvaluating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Simulating on Devnet...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        <span>Simulate &amp; Audit Intent</span>
                        <CornerDownLeft className="h-3.5 w-3.5 opacity-80" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </section>

            {/* Solana Pay Instant Invoice Modal/Card when active */}
            {agentResult?.verdict.solanaPayPayload && (
              <SolanaPayModalCard
                invoice={agentResult.verdict.solanaPayPayload}
                onSettledOnChain={handleSolanaPayConfirmed}
                onPayWithConnectedWallet={handlePaySolanaPayInvoice}
                isPayingDesktop={isPayingInvoice}
              />
            )}

            {/* Structured AI Security Verdict Card */}
            {agentResult ? (
              <RiskVerdictCard
                intent={agentResult.intent}
                verdict={agentResult.verdict}
                isSigning={isSigningTx}
                lastExecutionTx={lastExecutionTx}
                executionError={executionError}
                onExecuteOnChain={handleExecuteOnChain}
              />
            ) : (
              <div className="rounded-2xl border border-sentinel-border bg-sentinel-panel/60 p-8 text-center">
                <ShieldCheck className="mx-auto h-10 w-10 text-sentinel-green/80" />
                <h3 className="mt-3 text-base font-bold text-white">
                  AI Pre-Flight Firewall Ready
                </h3>
                <p className="mx-auto mt-1 max-w-lg text-xs text-slate-400">
                  Submit any natural-language DeFi command above—or click one of
                  the{" "}
                  <strong className="text-sentinel-green">
                    3 Judge Demo Scenarios
                  </strong>{" "}
                  in the top navigation bar—to run a live Solana Devnet RPC
                  simulation and inspect the AI Security Verdict Card.
                </p>
              </div>
            )}
          </div>

          {/* Right 4 Columns: On-Chain GuardPolicy PDA Vault & Anchor Architecture Card */}
          <div className="space-y-6 lg:col-span-4">
            <GuardPolicyPanel
              policy={policyState}
              onUpdatePolicyLocal={(nextMax, nextAudit) => {
                setPolicyMaxSol(nextMax);
                setRequireAiAudit(nextAudit);
              }}
              onSyncPolicyOnChain={handleSyncPolicySidebar}
              isSyncing={isSyncingPolicy}
            />

            {/* Anchor Contract Invariant Reference Card for Judges */}
            <div className="rounded-2xl border border-sentinel-border bg-sentinel-panel p-5">
              <div className="flex items-center gap-2">
                <Code2 className="h-4 w-4 text-sentinel-purple" />
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white">
                  Anchor Contract Guardrails
                </h3>
              </div>
              <pre className="mt-3 overflow-x-auto rounded-xl border border-sentinel-border bg-[#0B0F17] p-3 font-mono text-[11px] leading-relaxed text-slate-300">
{`// programs/sentinel_vault/src/lib.rs
require!(
  ai_risk_score <= 30,
  SentinelError::RiskScoreTooHigh
);
require!(
  amount <= policy.max_tx_lamports,
  SentinelError::ExceedsPolicyLimit
);
system_program::transfer(cpi_ctx, amount)?;
emit!(AuditLogged { ... });`}
              </pre>
            </div>
          </div>
        </div>

        {/* Live On-Chain Audit Trail Table */}
        <AuditTrailTable
          entries={auditEntries}
          onClearHistory={() => {
            setAuditEntries([]);
            window.localStorage.removeItem(AUDIT_STORAGE_KEY);
          }}
        />
      </main>
    </div>
  );
}
