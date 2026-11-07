"use client";

import React from "react";
import {
  ExternalLink,
  History,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type { AuditTrailEntry } from "@/lib/types/sentinel";
import { shortenAddress } from "@/lib/solana/constants";

interface AuditTrailTableProps {
  entries: AuditTrailEntry[];
  onClearHistory: () => void;
}

export function AuditTrailTable({
  entries,
  onClearHistory,
}: AuditTrailTableProps) {
  return (
    <section className="rounded-2xl border border-sentinel-border bg-sentinel-panel p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <History className="h-5 w-5 text-sentinel-purple" />
          <div>
            <h2 className="text-base font-bold text-white">
              Live On-Chain Audit Trail (Solana Devnet)
            </h2>
            <p className="text-xs text-slate-400">
              Every AI-evaluated intent hash, risk score, compute profile, and
              confirmed Devnet signature
            </p>
          </div>
        </div>

        {entries.length > 0 && (
          <button
            type="button"
            onClick={onClearHistory}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sentinel-border bg-[#0B0F17] px-3 py-1.5 text-xs text-slate-400 hover:border-slate-600 hover:text-white"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Clear Local View</span>
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-sentinel-border bg-[#0B0F17]/60 px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-300">
            No Audit Events Logged in Current Session Yet
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Click{" "}
            <strong className="text-sentinel-green">
              Scenario A (Safe AI Payment)
            </strong>{" "}
            or{" "}
            <strong className="text-sentinel-danger">
              Scenario B (Blocked Malicious Drainer)
            </strong>{" "}
            above to populate the live audit trail.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-sentinel-border font-mono text-[11px] uppercase tracking-wider text-slate-400">
                <th className="py-3 pr-4">Timestamp</th>
                <th className="px-3 py-3">Intent Summary</th>
                <th className="px-3 py-3">AI Risk Score</th>
                <th className="px-3 py-3">Compute Units</th>
                <th className="px-3 py-3">Intent Hash</th>
                <th className="py-3 pl-3 text-right">
                  Solana Explorer (Devnet)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sentinel-border/60">
              {entries.map((item) => {
                const isBlocked = item.verdict === "BLOCKED";
                return (
                  <tr
                    key={item.id}
                    className="transition hover:bg-[#0B0F17]/60"
                  >
                    <td className="whitespace-nowrap py-3.5 pr-4 font-mono text-[11px] text-slate-400">
                      {new Date(item.timestamp).toLocaleTimeString([], {
                        hour12: false,
                      })}
                    </td>

                    <td className="px-3 py-3.5">
                      <div className="font-medium text-white">
                        {item.intentSummary}
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-slate-500">
                        Mode: {item.executionMode}
                      </div>
                    </td>

                    <td className="whitespace-nowrap px-3 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold ${
                          isBlocked
                            ? "border border-sentinel-danger/50 bg-sentinel-danger/15 text-sentinel-danger"
                            : "border border-sentinel-green/40 bg-sentinel-green/15 text-sentinel-green"
                        }`}
                      >
                        {isBlocked ? (
                          <ShieldAlert className="h-3 w-3" />
                        ) : (
                          <ShieldCheck className="h-3 w-3" />
                        )}
                        {item.riskScore}/100
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-3 py-3.5 font-mono text-slate-300">
                      {item.computeUnits.toLocaleString()} CU
                    </td>

                    <td className="whitespace-nowrap px-3 py-3.5 font-mono text-[11px] text-slate-400">
                      0x{item.intentHashHex.slice(0, 12)}...
                    </td>

                    <td className="whitespace-nowrap py-3.5 pl-3 text-right">
                      {item.explorerUrl && item.signature ? (
                        <a
                          href={item.explorerUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-sentinel-green/40 bg-sentinel-green/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-sentinel-green transition hover:bg-sentinel-green/20"
                        >
                          <span>
                            View on Solana Explorer (
                            {shortenAddress(item.signature, 4)})
                          </span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-sentinel-danger/40 bg-sentinel-danger/10 px-2.5 py-1 font-mono text-[11px] text-sentinel-danger">
                          Rejected Pre-Signature
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
