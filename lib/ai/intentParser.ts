import { PublicKey } from "@solana/web3.js";
import {
  DEMO_BOUNTY_TREASURY,
  DEMO_SAFE_RECIPIENT,
  MOCK_MALICIOUS_DRAINER,
} from "../solana/constants";
import type { IntentActionType, ParsedIntent } from "../types/sentinel";

const BASE58_PUBKEY_REGEX = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;

function extractValidPubkey(text: string): string | undefined {
  const candidates = text.match(BASE58_PUBKEY_REGEX) ?? [];
  for (const candidate of candidates) {
    try {
      const pk = new PublicKey(candidate);
      return pk.toBase58();
    } catch {
      // Ignore substrings that fail Base58 32-byte decoding
    }
  }
  return undefined;
}

function extractSolAmount(text: string, fallback: number): number {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:devnet\s+)?sol\b/i);
  if (match) {
    const val = parseFloat(match[1]);
    if (Number.isFinite(val) && val > 0) return val;
  }
  const genericNum = text.match(/\b(\d+\.\d+)\b/);
  if (genericNum) {
    const val = parseFloat(genericNum[1]);
    if (Number.isFinite(val) && val > 0) return val;
  }
  return fallback;
}

/**
 * Deterministic zero-dependency local natural-language parser so MLH judges can test
 * every single Sentinel flow out-of-the-box without needing an OpenAI or Gemini API key.
 */
export function parseIntentDeterministic(
  prompt: string,
  walletAddress?: string
): ParsedIntent {
  const clean = prompt.trim();
  const lower = clean.toLowerCase();
  const detectedPubkey = extractValidPubkey(clean);

  // 1. Detect Malicious / Security Simulation intents
  if (
    lower.includes("drainer") ||
    lower.includes("setauthority") ||
    lower.includes("malicious") ||
    lower.includes("approve") ||
    lower.includes("raw transaction") ||
    (lower.includes("simulate") && lower.includes("audit"))
  ) {
    const isMaliciousPattern =
      lower.includes("drainer") ||
      lower.includes("setauthority") ||
      lower.includes("malicious") ||
      lower.includes("approve") ||
      lower.includes("unauthorized") ||
      detectedPubkey === MOCK_MALICIOUS_DRAINER;

    const amountSol = extractSolAmount(clean, isMaliciousPattern ? 2.5 : 0.02);
    return {
      action: "SECURITY_SIMULATION",
      rawPrompt: clean,
      summary: isMaliciousPattern
        ? `Pre-flight security audit of untrusted payload (SPL Approve + SetAuthority + ${amountSol} SOL sweep)`
        : `Pre-flight RPC security simulation for ${amountSol} SOL payload`,
      amountSol,
      recipient: detectedPubkey ?? (isMaliciousPattern ? MOCK_MALICIOUS_DRAINER : DEMO_SAFE_RECIPIENT),
      simulationScenario: isMaliciousPattern ? "MALICIOUS_DRAINER" : "SAFE_TRANSFER",
      parserSource: "deterministic-engine",
    };
  }

  // 2. Detect Solana Pay QR Invoice / Checkout Split intents
  if (
    lower.includes("solana pay") ||
    lower.includes("invoice") ||
    lower.includes("qr") ||
    lower.includes("checkout") ||
    lower.includes("bounty settlement")
  ) {
    const amountSol = extractSolAmount(clean, 0.05);
    const splitMatch = lower.match(/split\s+(?:between|across|for)?\s*(\d+)/i);
    const splitCount = splitMatch ? parseInt(splitMatch[1], 10) : undefined;

    return {
      action: "SOLANA_PAY_REQUEST",
      rawPrompt: clean,
      summary: `Generate Solana Pay instant settlement QR invoice for ${amountSol} SOL`,
      amountSol,
      recipient: detectedPubkey ?? walletAddress ?? DEMO_BOUNTY_TREASURY,
      label: "Sentinel DeFi",
      message: lower.includes("bounty")
        ? "Hackathon Bounty Settlement"
        : "Verified Invoice",
      splitCount,
      parserSource: "deterministic-engine",
    };
  }

  // 3. Detect On-Chain GuardPolicy Update intents
  if (
    (lower.includes("policy") ||
      lower.includes("spending cap") ||
      lower.includes("max limit") ||
      lower.includes("limit to")) &&
    (lower.includes("set") ||
      lower.includes("update") ||
      lower.includes("change") ||
      lower.includes("configure"))
  ) {
    const newMaxTxSol = extractSolAmount(clean, 0.5);
    const disableAudit =
      lower.includes("disable audit") || lower.includes("without audit");
    return {
      action: "UPDATE_POLICY",
      rawPrompt: clean,
      summary: `Update GuardPolicy max spending cap to ${newMaxTxSol} SOL per tx (AI Audit ${disableAudit ? "Optional" : "Required"})`,
      newMaxTxSol,
      requireAiAudit: !disableAudit,
      parserSource: "deterministic-engine",
    };
  }

  // 4. Default: Guarded SOL Transfer intent
  const amountSol = extractSolAmount(clean, 0.01);
  const recipient = detectedPubkey ?? DEMO_SAFE_RECIPIENT;

  return {
    action: "TRANSFER",
    rawPrompt: clean,
    summary: `Guarded transfer of ${amountSol} Devnet SOL to ${recipient.slice(0, 6)}...${recipient.slice(-4)}`,
    amountSol,
    recipient,
    parserSource: "deterministic-engine",
  };
}

const SYSTEM_INSTRUCTION = `You are Solana Sentinel's DeFi Intent Parser. Convert the user's natural language Solana command into strict JSON matching:
{
  "action": "TRANSFER" | "SOLANA_PAY_REQUEST" | "SECURITY_SIMULATION" | "UPDATE_POLICY",
  "summary": "concise 1-line summary",
  "amountSol": number (optional, positive SOL amount),
  "recipient": "base58 Solana address if present (optional)",
  "label": "merchant/vault label for Solana Pay (optional)",
  "message": "invoice description for Solana Pay (optional)",
  "splitCount": number (optional),
  "newMaxTxSol": number (optional, for UPDATE_POLICY),
  "requireAiAudit": boolean (optional, for UPDATE_POLICY),
  "simulationScenario": "SAFE_TRANSFER" | "MALICIOUS_DRAINER" (optional, set MALICIOUS_DRAINER if auditing drainer/approve/SetAuthority payloads)
}
Output raw JSON only with no markdown fences.`;

/**
 * Hybrid LLM + Deterministic Intent Parser:
 * Uses OpenAI (`OPENAI_API_KEY`) or Google Gemini (`GEMINI_API_KEY`) when configured,
 * and falls back seamlessly to the deterministic engine so the app works 100% zero-config.
 */
export async function parseNaturalLanguageIntent(
  prompt: string,
  walletAddress?: string
): Promise<ParsedIntent> {
  const fallback = parseIntentDeterministic(prompt, walletAddress);

  // 1. Optional OpenAI Compatible Route
  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  if (openAiKey) {
    try {
      const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_INSTRUCTION },
            { role: "user", content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(6000),
      });

      if (res.ok) {
        const json = await res.json();
        const content = json.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content) as Partial<ParsedIntent>;
          const validActions: IntentActionType[] = [
            "TRANSFER",
            "SOLANA_PAY_REQUEST",
            "SECURITY_SIMULATION",
            "UPDATE_POLICY",
          ];
          if (parsed.action && validActions.includes(parsed.action)) {
            return {
              ...fallback,
              ...parsed,
              recipient:
                extractValidPubkey(parsed.recipient ?? "") ?? fallback.recipient,
              rawPrompt: prompt.trim(),
              parserSource: "openai",
            };
          }
        }
      }
    } catch {
      // Fall through cleanly to Gemini or deterministic parser
    }
  }

  // 2. Optional Google Gemini Compatible Route
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    try {
      const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            generationConfig: {
              temperature: 0,
              responseMimeType: "application/json",
            },
            contents: [
              {
                role: "user",
                parts: [{ text: `${SYSTEM_INSTRUCTION}\n\nUser Command: ${prompt}` }],
              },
            ],
          }),
          signal: AbortSignal.timeout(6000),
        }
      );

      if (res.ok) {
        const json = await res.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text) as Partial<ParsedIntent>;
          if (parsed.action) {
            return {
              ...fallback,
              ...parsed,
              recipient:
                extractValidPubkey(parsed.recipient ?? "") ?? fallback.recipient,
              rawPrompt: prompt.trim(),
              parserSource: "gemini",
            };
          }
        }
      }
    } catch {
      // Fall through cleanly to deterministic engine
    }
  }

  return fallback;
}
