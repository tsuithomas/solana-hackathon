"use client";

import React, { useEffect, useState } from "react";
import { Connection } from "@solana/web3.js";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  QrCode,
  Radio,
  Send,
  Users,
} from "lucide-react";
import type { SolanaPayInvoicePayload } from "@/lib/types/sentinel";
import {
  checkSolanaPaySettlement,
  renderSolanaPayQrSvg,
} from "@/lib/solana/solanaPay";
import { SOLANA_DEVNET_RPC, shortenAddress } from "@/lib/solana/constants";

interface SolanaPayModalCardProps {
  invoice: SolanaPayInvoicePayload;
  onSettledOnChain: (signature: string, explorerUrl: string) => void;
  onPayWithConnectedWallet: (invoice: SolanaPayInvoicePayload) => Promise<void>;
  isPayingDesktop: boolean;
}

export function SolanaPayModalCard({
  invoice,
  onSettledOnChain,
  onPayWithConnectedWallet,
  isPayingDesktop,
}: SolanaPayModalCardProps) {
  const [qrSvg, setQrSvg] = useState<string>("");
  const [copiedUri, setCopiedUri] = useState(false);
  const [settlement, setSettlement] = useState<{
    settled: boolean;
    signature: string | null;
    explorerUrl: string | null;
  }>({ settled: false, signature: null, explorerUrl: null });

  // Render crisp SVG QR code
  useEffect(() => {
    let active = true;
    setSettlement({ settled: false, signature: null, explorerUrl: null });
    renderSolanaPayQrSvg(invoice.url).then((svg) => {
      if (active) setQrSvg(svg);
    });
    return () => {
      active = false;
    };
  }, [invoice]);

  // Poll Solana Devnet every 2.5s for the invoice's unique `reference` public key
  useEffect(() => {
    if (settlement.settled) return;
    const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
    let cancelled = false;

    const poll = async () => {
      const res = await checkSolanaPaySettlement(connection, invoice.reference);
      if (!cancelled && res.settled && res.signature && res.explorerUrl) {
        setSettlement(res);
        onSettledOnChain(res.signature, res.explorerUrl);
      }
    };

    const interval = setInterval(poll, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [invoice.reference, settlement.settled, onSettledOnChain]);

  const copyUri = () => {
    navigator.clipboard.writeText(invoice.url);
    setCopiedUri(true);
    setTimeout(() => setCopiedUri(false), 1800);
  };

  return (
    <div className="rounded-2xl border border-sentinel-purple/50 bg-gradient-to-br from-[#17122B] via-sentinel-panel to-[#0B0F17] p-5 shadow-glow-purple sm:p-6">
      <div className="flex flex-col gap-6 md:flex-row md:items-center">
        {/* Scannable Solana Pay QR Frame */}
        <div className="mx-auto flex shrink-0 flex-col items-center rounded-2xl bg-white p-3.5 shadow-xl md:mx-0">
          {qrSvg ? (
            <div
              className="h-[210px] w-[210px] [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          ) : (
            <div className="flex h-[210px] w-[210px] items-center justify-center text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
          <span className="mt-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-900">
            SOLANA PAY • DEVNET
          </span>
        </div>

        {/* Invoice Metadata & Live Polling Controls */}
        <div className="flex-1 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-sentinel-purple" />
              <h3 className="text-lg font-bold text-white">
                Instant Solana Pay Settlement Request
              </h3>
            </div>

            {settlement.settled ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sentinel-green/50 bg-sentinel-green/20 px-3 py-1 font-mono text-xs font-bold text-sentinel-green">
                <CheckCircle2 className="h-3.5 w-3.5" />
                SETTLED ON DEVNET
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sentinel-purple/50 bg-sentinel-purple/20 px-3 py-1 font-mono text-xs text-[#D5B8FF]">
                <Radio className="h-3.5 w-3.5 animate-pulse text-sentinel-green" />
                Polling Devnet Reference...
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-sentinel-border bg-[#0B0F17]/80 p-3">
              <div className="text-[11px] text-slate-400">Requested Amount</div>
              <div className="mt-0.5 font-mono text-lg font-extrabold text-sentinel-green">
                {invoice.amountSol} SOL
              </div>
            </div>

            <div className="rounded-xl border border-sentinel-border bg-[#0B0F17]/80 p-3">
              <div className="text-[11px] text-slate-400">Recipient Vault</div>
              <div className="mt-1 font-mono text-xs font-semibold text-white">
                {shortenAddress(invoice.recipient, 5)}
              </div>
            </div>

            <div className="col-span-2 rounded-xl border border-sentinel-border bg-[#0B0F17]/80 p-3 sm:col-span-1">
              <div className="text-[11px] text-slate-400">Reference Key</div>
              <div className="mt-1 font-mono text-xs font-semibold text-[#C49BFF]">
                {shortenAddress(invoice.reference, 5)}
              </div>
            </div>
          </div>

          {invoice.splitCount && invoice.perPartySol && (
            <div className="flex items-center gap-2 rounded-xl border border-sentinel-purple/30 bg-sentinel-purple/10 px-3.5 py-2 text-xs text-purple-200">
              <Users className="h-4 w-4 text-sentinel-purple" />
              <span>
                Bounty Split Mode:{" "}
                <strong>{invoice.splitCount} contributors</strong> ×{" "}
                <strong className="font-mono text-white">
                  {invoice.perPartySol} SOL
                </strong>{" "}
                each
              </span>
            </div>
          )}

          {/* Raw `solana:` URI Box */}
          <div className="flex items-center justify-between gap-2 rounded-xl border border-sentinel-border bg-black/60 px-3 py-2 font-mono text-[11px] text-slate-300">
            <span className="truncate">{invoice.url}</span>
            <button
              type="button"
              onClick={copyUri}
              className="inline-flex shrink-0 items-center gap-1 rounded border border-sentinel-border bg-sentinel-panel px-2.5 py-1 text-xs text-white hover:border-sentinel-green"
            >
              <Copy className="h-3 w-3" />
              {copiedUri ? "Copied" : "Copy URI"}
            </button>
          </div>

          {/* Desktop 1-Click Settle Button OR Explorer Link */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {settlement.settled && settlement.explorerUrl ? (
              <a
                href={settlement.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-sentinel-green px-4 py-2.5 text-xs font-bold text-[#0B0F17] shadow-glow-green"
              >
                <span>View Confirmed Solana Pay Tx (Devnet)</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <button
                type="button"
                disabled={isPayingDesktop}
                onClick={() => onPayWithConnectedWallet(invoice)}
                className="inline-flex items-center gap-2 rounded-xl border border-sentinel-green/50 bg-sentinel-green/15 px-4 py-2.5 text-xs font-bold text-sentinel-green transition hover:bg-sentinel-green/25 disabled:opacity-50"
              >
                {isPayingDesktop ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Settling Invoice on Devnet...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    <span>
                      Settle {invoice.amountSol} SOL Invoice from Active Wallet
                    </span>
                  </>
                )}
              </button>
            )}
            <span className="text-xs text-slate-400">
              Scan with Phantom Mobile (Devnet) or click to settle directly in
              browser.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
