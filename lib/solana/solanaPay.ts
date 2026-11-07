import { encodeURL, findReference, FindReferenceError } from "@solana/pay";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import BigNumber from "bignumber.js";
import QRCode from "qrcode";
import type { SolanaPayInvoicePayload } from "../types/sentinel";
import { getExplorerTxUrl } from "./constants";

/**
 * Generates a canonical `@solana/pay` payment request URI (`solana:<recipient>?amount=...&reference=...`)
 * with a unique ephemeral Ed25519 `reference` public key for instant on-chain Devnet settlement detection.
 */
export function createSolanaPayRequestPayload(params: {
  recipient: string;
  amountSol: number;
  label?: string;
  message?: string;
  splitCount?: number;
}): SolanaPayInvoicePayload {
  const recipientPubkey = new PublicKey(params.recipient);
  const referencePubkey = Keypair.generate().publicKey;

  const label = params.label || "Sentinel DeFi";
  const message = params.message || "Verified Invoice";
  const memo = `SENTINEL_PAY_V1|amt=${params.amountSol}|ref=${referencePubkey.toBase58().slice(0, 10)}`;

  const urlObj = encodeURL({
    recipient: recipientPubkey,
    amount: new BigNumber(params.amountSol),
    reference: referencePubkey,
    label,
    message,
    memo,
  });

  const splitCount =
    params.splitCount && params.splitCount > 1 ? params.splitCount : undefined;
  const perPartySol = splitCount
    ? Number((params.amountSol / splitCount).toFixed(6))
    : undefined;

  return {
    url: urlObj.toString(),
    recipient: recipientPubkey.toBase58(),
    amountSol: params.amountSol,
    reference: referencePubkey.toBase58(),
    label,
    message,
    memo,
    splitCount,
    perPartySol,
  };
}

/**
 * Renders a crisp, high-contrast scannable SVG QR code from a Solana Pay URI.
 */
export async function renderSolanaPayQrSvg(solanaPayUrl: string): Promise<string> {
  return QRCode.toString(solanaPayUrl, {
    type: "svg",
    margin: 2,
    width: 248,
    errorCorrectionLevel: "M",
    color: {
      dark: "#0B0F17",
      light: "#FFFFFF",
    },
  });
}

/**
 * Polls Solana Devnet via `@solana/pay` `findReference` to detect real-time settlement
 * of an invoice's unique `reference` public key.
 */
export async function checkSolanaPaySettlement(
  connection: Connection,
  referenceStr: string
): Promise<{
  settled: boolean;
  signature: string | null;
  explorerUrl: string | null;
}> {
  try {
    const reference = new PublicKey(referenceStr);
    const sigInfo = await findReference(connection, reference, {
      finality: "confirmed",
    });
    return {
      settled: true,
      signature: sigInfo.signature,
      explorerUrl: getExplorerTxUrl(sigInfo.signature),
    };
  } catch (err) {
    if (err instanceof FindReferenceError) {
      return { settled: false, signature: null, explorerUrl: null };
    }
    return { settled: false, signature: null, explorerUrl: null };
  }
}
