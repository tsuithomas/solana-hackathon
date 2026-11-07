"use client";

import React from "react";
import {
  CheckCircle2,
  ExternalLink,
  Lock,
  RefreshCw,
  Shield,
  Sliders,
} from "lucide-react";
import type { GuardPolicyState } from "@/lib/types/sentinel";
import {
  SENTINEL_PROGRAM_ID_STR,
  getExplorerAddressUrl,
  shortenAddress,
} from "@/lib/solana/constants";

interface GuardPolicyPanelProps {
  policy: GuardPolicyState;
  onUpdatePolicyLocal: (nextMaxSol: number, nextRequireAudit: boolean) => void;
  onSyncPolicyOnChain: () => void;
  isSyncing: boolean;
}

export function GuardPolicyPanel({
  policy,
  onUpdatePolicyLocal,
  onSyncPolicyOnChain,
  isSyncing,
}: GuardPolicyPanelProps) {
  return (
    <aside className="space-y-4 rounded-2xl border border-sentinel-border bg-sentinel-panel p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-sentinel-green" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">
            On-Chain GuardPolicy Vault
          </h2>
        </div>
        <span className="rounded border border-sentinel-green/30 bg-sentinel-green/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-sentinel-green">
          PDA Bump #{policy.bump}
        </span>
      </div>

      {/* Deterministic PDA & Program Addresses */}
      <div className="space-y-2 rounded-xl border border-sentinel-border bg-[#0B0F17]/80 p-3.5 font-mono text-xs">
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Policy PDA</span>
          <a
            href={getExplorerAddressUrl(policy.policyPda)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sentinel-green hover:underline"
          >
            {shortenAddress(policy.policyPda, 6)}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-slate-400">Anchor Program</span>
          <a
            href={getExplorerAddressUrl(SENTINEL_PROGRAM_ID_STR)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[#C49BFF] hover:underline"
          >
            {shortenAddress(SENTINEL_PROGRAM_ID_STR, 6)}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-slate-400">Execution Mode</span>
          <span className="text-white">
            {policy.onChainDeployed
              ? "Anchor CPI Vault"
              : "Devnet Guard + SPL Memo"}
          </span>
        </div>
      </div>

      {/* Interactive Spending Limit & AI Firewall Controls */}
      <div className="space-y-3 rounded-xl border border-sentinel-border bg-[#0B0F17]/60 p-3.5">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-medium text-slate-300">
            <Sliders className="h-3.5 w-3.5 text-sentinel-purple" />
            Max Per-Tx Cap
          </span>
          <span className="font-mono text-sm font-bold text-sentinel-green">
            {policy.maxTxSol.toFixed(2)} SOL
          </span>
        </div>

        <input
          type="range"
          min="0.05"
          max="5.0"
          step="0.05"
          value={policy.maxTxSol}
          onChange={(e) =>
            onUpdatePolicyLocal(
              parseFloat(e.target.value),
              policy.requireAiAudit
            )
          }
          className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-sentinel-border accent-[#14F195]"
        />

        <div className="flex justify-between font-mono text-[10px] text-slate-500">
          <span>0.05 SOL</span>
          <span>0.50 SOL (Default)</span>
          <span>5.00 SOL</span>
        </div>

        <label className="mt-2 flex cursor-pointer items-center justify-between rounded-lg border border-sentinel-border/80 bg-sentinel-panel px-3 py-2 text-xs">
          <span className="text-slate-200">
            Require AI Audit (&lt;= 30/100)
          </span>
          <input
            type="checkbox"
            checked={policy.requireAiAudit}
            onChange={(e) =>
              onUpdatePolicyLocal(policy.maxTxSol, e.target.checked)
            }
            className="h-4 w-4 rounded accent-[#14F195]"
          />
        </label>

        <button
          type="button"
          onClick={onSyncPolicyOnChain}
          disabled={isSyncing}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-sentinel-purple/50 bg-sentinel-purple/15 px-3 py-2 text-xs font-semibold text-[#D5B8FF] transition hover:bg-sentinel-purple/25 disabled:opacity-50"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`}
          />
          <span>
            {isSyncing
              ? "Anchoring Policy on Devnet..."
              : "Anchor Policy Commitment On-Chain"}
          </span>
        </button>
      </div>

      {/* Vault Telemetry Counters */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-sentinel-border bg-[#0B0F17]/80 p-3">
          <div className="text-[11px] text-slate-400">Safe Audited Txs</div>
          <div className="mt-1 font-mono text-xl font-extrabold text-sentinel-green">
            {policy.safeTxCount}
          </div>
        </div>
        <div className="rounded-xl border border-sentinel-border bg-[#0B0F17]/80 p-3">
          <div className="text-[11px] text-slate-400">Threats Blocked</div>
          <div className="mt-1 font-mono text-xl font-extrabold text-sentinel-danger">
            {policy.blockedAttemptCount}
          </div>
        </div>
      </div>

      {/* Whitelisted Programs */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-slate-400">
          <Lock className="h-3 w-3 text-sentinel-green" />
          Whitelisted Downstream Programs
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 rounded border border-sentinel-border bg-[#0B0F17] px-2 py-1 font-mono text-[10px] text-slate-300">
            <CheckCircle2 className="h-3 w-3 text-sentinel-green" />
            SystemProgram (1111...1111)
          </span>
          <span className="inline-flex items-center gap-1 rounded border border-sentinel-border bg-[#0B0F17] px-2 py-1 font-mono text-[10px] text-slate-300">
            <CheckCircle2 className="h-3 w-3 text-sentinel-green" />
            SPL Memo v2 (MemoSq...fcHr)
          </span>
          <span className="inline-flex items-center gap-1 rounded border border-sentinel-border bg-[#0B0F17] px-2 py-1 font-mono text-[10px] text-slate-300">
            <CheckCircle2 className="h-3 w-3 text-sentinel-green" />
            Sentinel Vault ({shortenAddress(SENTINEL_PROGRAM_ID_STR, 4)})
          </span>
        </div>
      </div>
    </aside>
  );
}
