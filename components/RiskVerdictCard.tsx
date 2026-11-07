"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  ExternalLink,
  Fingerprint,
  Loader2,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import type { ParsedIntent, SecurityVerdict } from "@/lib/types/sentinel";
import { getExplorerAddressUrl, shortenAddress } from "@/lib/solana/constants";

interface RiskVerdictCardProps {
  intent: ParsedIntent;
  verdict: SecurityVerdict;
  isSigning: boolean;
  lastExecutionTx: {
    signature: string;
    explorerUrl: string;
    mode: string;
  } | null;
  executionError: string | null;
  onExecuteOnChain: () => void;
}

export function RiskVerdictCard({
  intent,
  verdict,
  isSigning,
  lastExecutionTx,
  executionError,
  onExecuteOnChain,
}: RiskVerdictCardProps) {
  const [showLogs, setShowLogs] = useState(false);

  const isSafe = verdict.verdict === "SAFE";
  const isBlocked = verdict.verdict === "BLOCKED";

  const accentHex = isBlocked
    ? "#FF3B69"
    : isSafe
      ? "#14F195"
      : "#FFB020";

  // SVG Gauge circumference math (r = 46 -> 2 * pi * 46 = 289.02)
  const circumference = 289.02;
  const strokeDashoffset =
    circumference - (Math.min(100, Math.max(0, verdict.riskScore)) / 100) * circumference;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className={`rounded-2xl border p-5 sm:p-6 ${
        isBlocked
          ? "border-sentinel-danger/50 bg-gradient-to-b from-[#1E1019] to-sentinel-panel shadow-glow-danger"
          : "border-sentinel-green/35 bg-gradient-to-b from-[#0F1F22] to-sentinel-panel shadow-glow-green"
      }`}
    >
      {/* Top Header: Verdict Status + Radial Risk Score Gauge */}
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider ${
                isBlocked
                  ? " border border-sentinel-danger/50 bg-sentinel-danger/20 text-sentinel-danger"
                  : "border border-sentinel-green/40 bg-sentinel-green/15 text-sentinel-green"
              }`}
            >
              {isBlocked ? (
                <ShieldAlert className="h-3.5 w-3.5" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" />
              )}
              AI FIREWALL VERDICT: {verdict.verdict}
            </span>

            <span className="rounded-md border border-sentinel-border bg-[#0B0F17]/80 px-2.5 py-1 font-mono text-[11px] text-slate-300">
              ACTION: {intent.action}
            </span>

            <span className="rounded-md border border-sentinel-purple/30 bg-sentinel-purple/10 px-2.5 py-1 font-mono text-[11px] text-[#C49BFF]">
              Engine: {intent.parserSource}
            </span>
          </div>

          <h3 className="text-lg font-bold text-white">{intent.summary}</h3>
          <p className="text-sm leading-relaxed text-slate-300">
            {verdict.plainEnglishExplanation}
          </p>
        </div>

        {/* Animated 0-100 Risk Gauge */}
        <div className="flex shrink-0 items-center gap-4 self-start rounded-xl border border-sentinel-border bg-[#0B0F17]/90 px-4 py-3 sm:self-center">
          <div className="relative h-24 w-24">
            <svg className="h-24 w-24 -rotate-90 transform" viewBox="0 0 110 110">
              <circle
                cx="55"
                cy="55"
                r="46"
                stroke="#1F2B45"
                strokeWidth="9"
                fill="transparent"
              />
              <motion.circle
                cx="55"
                cy="55"
                r="46"
                stroke={accentHex}
                strokeWidth="9"
                strokeLinecap="round"
                fill="transparent"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset }}
                transition={{ duration: 0.65, ease: "easeOut" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className="font-mono text-2xl font-extrabold"
                style={{ color: accentHex }}
              >
                {verdict.riskScore}
              </span>
              <span className="font-mono text-[10px] uppercase text-slate-400">
                / 100 RISK
              </span>
            </div>
          </div>

          <div className="space-y-1 font-mono text-xs">
            <div className="text-slate-400">Anchor Max Ceiling</div>
            <div className="font-bold text-white">&lt;= 30 / 100</div>
            <div
              className={`text-[11px] font-semibold ${
                verdict.anchorGuardPassed
                  ? "text-sentinel-green"
                  : "text-sentinel-danger"
              }`}
            >
              {verdict.anchorGuardPassed ? "PASSES ON-CHAIN" : "REJECTED ON-CHAIN"}
            </div>
          </div>
        </div>
      </div>

      {/* Balance Deltas & Threat Detection Grid */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Pre-Flight Account Balance Deltas */}
        <div className="rounded-xl border border-sentinel-border bg-[#0B0F17]/75 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-slate-400">
              Pre-Flight Account Balance Deltas
            </span>
            <span className="font-mono text-[11px] text-slate-500">
              Slot #{verdict.simulation.slot || "Live"}
            </span>
          </div>

          <div className="space-y-2">
            {verdict.balanceDeltas.map((delta) => (
              <div
                key={delta.account + delta.direction}
                className="flex items-center justify-between rounded-lg border border-sentinel-border/60 bg-sentinel-panel/70 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  {delta.direction === "OUTFLOW" ? (
                    <ArrowUpRight className="h-4 w-4 text-amber-400" />
                  ) : (
                    <ArrowDownLeft className="h-4 w-4 text-sentinel-green" />
                  )}
                  <div>
                    <div className="font-medium text-white">{delta.label}</div>
                    <a
                      href={getExplorerAddressUrl(delta.account)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[11px] text-slate-400 hover:text-sentinel-green"
                    >
                      {shortenAddress(delta.account, 6)} ↗
                    </a>
                  </div>
                </div>

                <span
                  className={`font-mono text-sm font-bold ${
                    delta.direction === "OUTFLOW"
                      ? "text-amber-300"
                      : "text-sentinel-green"
                  }`}
                >
                  {delta.deltaSol > 0 ? "+" : ""}
                  {delta.deltaSol.toFixed(6)} SOL
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Instruction & Authority Security Scanner Findings */}
        <div className="rounded-xl border border-sentinel-border bg-[#0B0F17]/75 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-slate-400">
              Instruction & Bytecode Scanner
            </span>
            <span className="font-mono text-[11px] text-slate-400">
              {verdict.simulation.instructionCount} Instruction(s)
            </span>
          </div>

          <div className="space-y-2">
            {verdict.threats.map((threat) => {
              const badgeStyle =
                threat.severity === "CRITICAL"
                  ? "border-sentinel-danger/50 bg-sentinel-danger/15 text-sentinel-danger"
                  : threat.severity === "HIGH"
                    ? "border-amber-500/50 bg-amber-500/15 text-amber-300"
                    : "border-sentinel-green/40 bg-sentinel-green/10 text-sentinel-green";

              return (
                <div
                  key={threat.id}
                  className="rounded-lg border border-sentinel-border/70 bg-sentinel-panel/80 p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white">
                      {threat.title}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold ${badgeStyle}`}
                    >
                      {threat.severity}
                    </span>
                  </div>
                  <p className="mt-1 leading-relaxed text-slate-400">
                    {threat.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Cryptographic Commitment & RPC Simulation Metadata Strip */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sentinel-border bg-[#0B0F17]/90 px-4 py-2.5 font-mono text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5 text-slate-300">
            <Cpu className="h-3.5 w-3.5 text-sentinel-purple" />
            Compute:{" "}
            <strong className="text-white">
              {verdict.simulation.unitsConsumed.toLocaleString()} CU
            </strong>
          </span>

          <span className="flex items-center gap-1.5 text-slate-300">
            <Fingerprint className="h-3.5 w-3.5 text-sentinel-green" />
            Intent SHA-256:{" "}
            <span className="text-slate-400">
              0x{verdict.intentHashHex.slice(0, 16)}...
            </span>
          </span>

          <a
            href={getExplorerAddressUrl(verdict.policyPda)}
            target="_blank"
            rel="noreferrer"
            className="text-slate-400 hover:text-sentinel-green"
          >
            GuardPolicy PDA: {shortenAddress(verdict.policyPda, 5)} ↗
          </a>
        </div>

        <button
          type="button"
          onClick={() => setShowLogs((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-sentinel-green hover:underline"
        >
          <Terminal className="h-3.5 w-3.5" />
          <span>{showLogs ? "Hide RPC Logs" : "Inspect Devnet RPC Logs"}</span>
          {showLogs ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Expandable Raw Solana SVM Simulation Logs */}
      {showLogs && (
        <div className="mt-3 max-h-44 overflow-y-auto rounded-xl border border-sentinel-border bg-black/80 p-3 font-mono text-[11px] text-emerald-300">
          {verdict.simulation.logs.map((line, i) => (
            <div key={i} className="py-0.5">
              <span className="mr-2 text-slate-600">[{i + 1}]</span>
              {line}
            </div>
          ))}
        </div>
      )}

      {/* Action Footer: Sign & Execute On-Chain OR Hard Firewall Block */}
      {intent.action !== "SOLANA_PAY_REQUEST" && (
        <div className="mt-5 flex flex-col items-stretch justify-between gap-3 border-t border-sentinel-border pt-4 sm:flex-row sm:items-center">
          <div className="text-xs text-slate-400">
            {verdict.anchorGuardPassed ? (
              <span>
                Signing anchors{" "}
                <code className="text-sentinel-green">
                  score={verdict.riskScore}
                </code>{" "}
                +{" "}
                <code className="text-sentinel-purple">
                  intent_hash[0..32]
                </code>{" "}
                permanently on Solana Devnet.
              </span>
            ) : (
              <span className="flex items-center gap-1.5 font-mono text-sentinel-danger">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Blocked by On-Chain Invariant: {verdict.anchorRejectionCode}
              </span>
            )}
          </div>

          {verdict.anchorGuardPassed ? (
            <button
              type="button"
              onClick={onExecuteOnChain}
              disabled={isSigning}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sentinel-green to-emerald-400 px-5 py-3 text-sm font-bold text-[#0B0F17] shadow-glow-green transition hover:brightness-110 disabled:opacity-60"
            >
              {isSigning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Signing & Confirming on Devnet...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Sign & Execute On-Chain (Devnet)</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-sentinel-danger/60 bg-sentinel-danger/20 px-5 py-3 font-mono text-xs font-bold text-sentinel-danger"
            >
              <Lock className="h-4 w-4" />
              <span>FIREWALL LOCKED — SIGNATURE PREVENTED</span>
            </button>
          )}
        </div>
      )}

      {/* Live Confirmed Transaction Banner */}
      {lastExecutionTx && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sentinel-green/50 bg-sentinel-green/15 px-4 py-3 text-xs">
          <div className="flex items-center gap-2 text-sentinel-green">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="font-semibold">
              Confirmed on Solana Devnet ({lastExecutionTx.mode}):
            </span>
            <span className="font-mono text-white">
              {shortenAddress(lastExecutionTx.signature, 8)}
            </span>
          </div>
          <a
            href={lastExecutionTx.explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg bg-sentinel-green px-3 py-1.5 font-semibold text-[#0B0F17] transition hover:brightness-110"
          >
            <span>View on Solana Explorer (Devnet)</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      )}

      {/* Execution Error / Unfunded Wallet Helper */}
      {executionError && (
        <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          {executionError}
        </div>
      )}
    </motion.div>
  );
}
