"use client";

import React from "react";
import dynamic from "next/dynamic";
import {
  Activity,
  AlertOctagon,
  CheckCircle2,
  Copy,
  Droplets,
  ExternalLink,
  Flame,
  KeyRound,
  Loader2,
  QrCode,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { shortenAddress } from "@/lib/solana/constants";

const WalletMultiButtonDynamic = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

interface JudgeDemoBarProps {
  tps: number | null;
  blockHeight: number | null;
  activeAddress: string;
  usingBurnerSigner: boolean;
  onToggleBurnerSigner: () => void;
  solBalance: number | null;
  isAirdropping: boolean;
  airdropMessage: {
    type: "success" | "rate_limit" | "error";
    text: string;
    txUrl?: string;
  } | null;
  onRequestAirdrop: () => void;
  onRunScenario: (scenario: "SCENARIO_A" | "SCENARIO_B" | "SCENARIO_C") => void;
  isLoadingScenario: boolean;
  activeScenario: "SCENARIO_A" | "SCENARIO_B" | "SCENARIO_C" | null;
}

export function JudgeDemoBar({
  tps,
  blockHeight,
  activeAddress,
  usingBurnerSigner,
  onToggleBurnerSigner,
  solBalance,
  isAirdropping,
  airdropMessage,
  onRequestAirdrop,
  onRunScenario,
  isLoadingScenario,
  activeScenario,
}: JudgeDemoBarProps) {
  const [copied, setCopied] = React.useState(false);

  const copyAddress = () => {
    navigator.clipboard.writeText(activeAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-sentinel-border bg-[#0B0F17]/95 backdrop-blur-xl">
      {/* Primary Top Institutional Bar */}
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        {/* Brand Identity */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sentinel-green/40 bg-gradient-to-br from-sentinel-green/20 via-sentinel-purple/20 to-transparent shadow-glow-green">
            <ShieldCheck className="h-5 w-5 text-sentinel-green" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-tight text-white">
                SOLANA SENTINEL
              </span>
              <span className="rounded-full border border-sentinel-purple/40 bg-sentinel-purple/15 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#C49BFF]">
                AI Risk Firewall + Vault
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Pre-Signature RPC Simulation • Natural-Language Execution • Anchor
              PDA Audit Log
            </p>
          </div>
        </div>

        {/* Network Telemetry, Faucet & Wallet Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Locked Solana Devnet Telemetry Pill */}
          <div className="flex items-center gap-2.5 rounded-lg border border-sentinel-green/30 bg-sentinel-panel px-3 py-1.5 font-mono text-xs">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sentinel-green opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-sentinel-green" />
            </span>
            <span className="font-semibold text-sentinel-green">
              SOLANA DEVNET
            </span>
            <span className="text-slate-600">|</span>
            <span className="flex items-center gap-1 text-slate-300">
              <Activity className="h-3.5 w-3.5 text-sentinel-purple" />
              {tps ? `${tps.toLocaleString()} TPS` : "2,840 TPS"}
            </span>
            <span className="hidden text-slate-600 md:inline">|</span>
            <span className="hidden text-slate-400 md:inline">
              Block #{blockHeight ? blockHeight.toLocaleString() : "Syncing..."}
            </span>
          </div>

          {/* 1-Click Devnet Faucet Button */}
          <button
            type="button"
            onClick={onRequestAirdrop}
            disabled={isAirdropping}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sentinel-green/40 bg-sentinel-green/10 px-3 py-1.5 text-xs font-semibold text-sentinel-green transition hover:bg-sentinel-green/20 disabled:opacity-50"
            title="Request 1.0 Devnet SOL to active wallet"
          >
            {isAirdropping ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Droplets className="h-3.5 w-3.5" />
            )}
            <span>Airdrop 1 SOL</span>
            {solBalance !== null && (
              <span className="ml-1 rounded bg-[#0B0F17]/80 px-1.5 py-0.5 font-mono text-[11px] text-white">
                {solBalance.toFixed(3)} SOL
              </span>
            )}
          </button>

          {/* In-Browser Judge Burner Toggle (for instant extensionless testing) */}
          <button
            type="button"
            onClick={onToggleBurnerSigner}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
              usingBurnerSigner
                ? "border-sentinel-purple/60 bg-sentinel-purple/20 text-white shadow-glow-purple"
                : "border-sentinel-border bg-sentinel-panel text-slate-300 hover:border-slate-600"
            }`}
            title="Toggle built-in Devnet Judge Burner Keypair (allows real Devnet signing even without Phantom installed)"
          >
            <KeyRound className="h-3.5 w-3.5 text-sentinel-purple" />
            <span>
              {usingBurnerSigner
                ? `Judge Signer (${shortenAddress(activeAddress, 4)})`
                : "Judge Signer"}
            </span>
          </button>

          {/* Official Solana Wallet Adapter MultiButton (Phantom / Solflare) */}
          <div className="sentinel-wallet-btn">
            <WalletMultiButtonDynamic />
          </div>
        </div>
      </div>

      {/* Airdrop Status / Public RPC Rate-Limit Fallback Banner */}
      {airdropMessage && (
        <div
          className={`border-t px-4 py-2 text-xs ${
            airdropMessage.type === "success"
              ? "border-sentinel-green/30 bg-sentinel-green/10 text-sentinel-green"
              : "border-amber-500/30 bg-amber-500/10 text-amber-200"
          }`}
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
            <span>{airdropMessage.text}</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={copyAddress}
                className="inline-flex items-center gap-1 rounded border border-white/20 bg-white/5 px-2 py-0.5 font-mono text-[11px] text-white hover:bg-white/10"
              >
                <Copy className="h-3 w-3" />
                {copied ? "Copied Address!" : shortenAddress(activeAddress, 6)}
              </button>
              {airdropMessage.txUrl ? (
                <a
                  href={airdropMessage.txUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-semibold underline"
                >
                  Explorer <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <a
                  href="https://faucet.solana.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-sentinel-green underline"
                >
                  Open Official Solana Web Faucet{" "}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 1-Click Judge Demo Scenarios Strip */}
      <div className="border-t border-sentinel-border/80 bg-[#0E1422]/90">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
            <Sparkles className="h-3.5 w-3.5 text-sentinel-green" />
            <span className="uppercase tracking-wider text-slate-400">
              1-Click Judge Demo Scenarios:
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Scenario A */}
            <button
              type="button"
              disabled={isLoadingScenario}
              onClick={() => onRunScenario("SCENARIO_A")}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                activeScenario === "SCENARIO_A"
                  ? "border-sentinel-green bg-sentinel-green/20 text-sentinel-green shadow-glow-green"
                  : "border-sentinel-green/30 bg-sentinel-green/5 text-emerald-200 hover:border-sentinel-green/60 hover:bg-sentinel-green/15"
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-sentinel-green" />
              <span>Scenario A: Safe AI Payment (0.01 SOL • 8/100)</span>
            </button>

            {/* Scenario B */}
            <button
              type="button"
              disabled={isLoadingScenario}
              onClick={() => onRunScenario("SCENARIO_B")}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                activeScenario === "SCENARIO_B"
                  ? "border-sentinel-danger bg-sentinel-danger/20 text-white shadow-glow-danger"
                  : "border-sentinel-danger/35 bg-sentinel-danger/10 text-rose-200 hover:border-sentinel-danger/70 hover:bg-sentinel-danger/20"
              }`}
            >
              <AlertOctagon className="h-3.5 w-3.5 text-sentinel-danger" />
              <span>Scenario B: Malicious Drainer Blocked (96/100)</span>
            </button>

            {/* Scenario C */}
            <button
              type="button"
              disabled={isLoadingScenario}
              onClick={() => onRunScenario("SCENARIO_C")}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                activeScenario === "SCENARIO_C"
                  ? "border-sentinel-purple bg-sentinel-purple/25 text-white shadow-glow-purple"
                  : "border-sentinel-purple/35 bg-sentinel-purple/10 text-purple-200 hover:border-sentinel-purple/70 hover:bg-sentinel-purple/20"
              }`}
            >
              <QrCode className="h-3.5 w-3.5 text-sentinel-purple" />
              <span>Scenario C: Instant Solana Pay QR Invoice</span>
            </button>

            <span className="hidden items-center gap-1 pl-1 font-mono text-[11px] text-slate-500 xl:inline-flex">
              <Flame className="h-3 w-3 text-sentinel-green" /> Zero API Key
              Required
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
