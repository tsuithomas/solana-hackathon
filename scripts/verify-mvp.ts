/**
 * End-to-End MVP Verification & Live Devnet RPC Integration Suite
 * Run via: `npm run verify` (`node --import tsx scripts/verify-mvp.ts`)
 */
import assert from "node:assert/strict";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { NextRequest } from "next/server";
import {
  DEMO_SAFE_RECIPIENT,
  SOLANA_DEVNET_RPC,
} from "../lib/solana/constants";
import {
  buildExecuteGuardedTransferInstruction,
  buildInitializePolicyInstruction,
  deriveGuardPolicyPda,
} from "../lib/solana/anchorClient";
import {
  buildGuardedTransferTransaction,
  buildMockMaliciousDrainerTransaction,
} from "../lib/solana/txBuilder";
import {
  computeIntentHash,
  simulateAndAuditTransaction,
} from "../lib/solana/simulator";
import { parseNaturalLanguageIntent } from "../lib/ai/intentParser";
import {
  createSolanaPayRequestPayload,
  renderSolanaPayQrSvg,
} from "../lib/solana/solanaPay";
import { POST } from "../app/api/agent/route";

async function main() {
  console.log("=== Solana Sentinel End-to-End MVP Verification ===");
  const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
  const testWallet = Keypair.generate().publicKey;

  // 1. Verify Anchor PDA & Borsh Instruction Wire Encoding
  const [policyPda, bump] = deriveGuardPolicyPda(testWallet);
  assert.ok(PublicKey.isOnCurve(testWallet.toBytes()), "Wallet on curve");
  assert.ok(bump >= 0 && bump <= 255, "Valid PDA bump");

  const initIx = buildInitializePolicyInstruction({
    authority: testWallet,
    maxTxLamports: 500_000_000,
    requireAiAudit: true,
  });
  assert.equal(initIx.data.length, 17, "initialize_policy wire size == 17");

  const { hex: intentHashHex, bytes: intentHashBytes } = computeIntentHash(
    "test-guarded-transfer"
  );
  const execIx = buildExecuteGuardedTransferInstruction({
    authority: testWallet,
    recipient: new PublicKey(DEMO_SAFE_RECIPIENT),
    amountLamports: 10_000_000,
    aiRiskScore: 8,
    intentHash: new Uint8Array(intentHashBytes),
  });
  assert.equal(
    execIx.data.length,
    49,
    "execute_guarded_transfer wire size == 49"
  );
  console.log(
    `[PASS] Anchor PDA (${policyPda.toBase58()}) & Borsh instruction discriminators verified.`
  );

  // 2. Verify Natural-Language AI Parser (Zero-Key Deterministic Engine)
  const transferIntent = await parseNaturalLanguageIntent(
    `Send 0.05 Devnet SOL to ${DEMO_SAFE_RECIPIENT} if the wallet risk score is safe`
  );
  assert.equal(transferIntent.action, "TRANSFER");
  assert.equal(transferIntent.amountSol, 0.05);

  const payIntent = await parseNaturalLanguageIntent(
    "Generate a Solana Pay checkout split of 0.25 SOL for hackathon bounty settlement"
  );
  assert.equal(payIntent.action, "SOLANA_PAY_REQUEST");
  assert.equal(payIntent.amountSol, 0.25);

  const simIntent = await parseNaturalLanguageIntent(
    "Simulate and audit this raw transaction payload for wallet-drainer authority changes"
  );
  assert.equal(simIntent.action, "SECURITY_SIMULATION");
  assert.equal(simIntent.simulationScenario, "MALICIOUS_DRAINER");

  const policyIntent = await parseNaturalLanguageIntent(
    "Update my GuardPolicy spending cap to 1.25 SOL"
  );
  assert.equal(policyIntent.action, "UPDATE_POLICY");
  assert.equal(policyIntent.newMaxTxSol, 1.25);
  console.log("[PASS] All 4 natural-language intent classes parsed cleanly.");

  // 3. Verify Scenario A: Safe 0.01 SOL Transfer + Live Devnet RPC Simulation
  const safeBuilt = await buildGuardedTransferTransaction({
    connection,
    authority: testWallet,
    recipient: new PublicKey(DEMO_SAFE_RECIPIENT),
    amountSol: 0.01,
    aiRiskScore: 8,
    intentHashBytes: new Uint8Array(intentHashBytes),
    intentHashHex,
    policyMaxTxSol: 0.5,
  });

  const safeVerdict = await simulateAndAuditTransaction({
    connection,
    transaction: safeBuilt.transaction,
    authority: testWallet,
    policyMaxTxSol: 0.5,
    intentCanonicalString: "scenario-a-safe-transfer",
    actionSummary: "Guarded transfer of 0.01 SOL",
  });
  assert.equal(safeVerdict.verdict, "SAFE");
  assert.equal(safeVerdict.riskScore, 8);
  assert.equal(safeVerdict.anchorGuardPassed, true);
  console.log(
    `[PASS] Scenario A simulated on Devnet (Slot #${safeVerdict.simulation.slot}, CU=${safeVerdict.simulation.unitsConsumed}, Risk=${safeVerdict.riskScore}/100 SAFE).`
  );

  // 4. Verify Scenario B: Malicious Drainer Blocked (Risk 96/100)
  const maliciousTx = await buildMockMaliciousDrainerTransaction({
    connection,
    victimAuthority: testWallet,
  });
  const maliciousVerdict = await simulateAndAuditTransaction({
    connection,
    transaction: maliciousTx,
    authority: testWallet,
    policyMaxTxSol: 0.5,
    intentCanonicalString: "scenario-b-drainer-audit",
    actionSummary: "Audit malicious SPL Approve + SetAuthority drainer",
  });
  assert.equal(maliciousVerdict.verdict, "BLOCKED");
  assert.equal(maliciousVerdict.riskScore, 96);
  assert.equal(maliciousVerdict.anchorGuardPassed, false);
  assert.ok(
    maliciousVerdict.threats.some((t) => t.code === "SET_AUTHORITY_DRAINER"),
    "Detected SetAuthority drainer"
  );
  assert.ok(
    maliciousVerdict.threats.some((t) => t.code === "UNLIMITED_TOKEN_APPROVAL"),
    "Detected unlimited SPL Token Approve"
  );
  assert.ok(
    maliciousVerdict.threats.some((t) => t.code === "EXCEEDS_POLICY_LIMIT"),
    "Detected policy limit violation"
  );
  assert.ok(
    maliciousVerdict.threats.some((t) => t.code === "MALICIOUS_ADDRESS_MATCH"),
    "Detected flagged malicious sink"
  );
  console.log(
    `[PASS] Scenario B blocked malicious drainer (${maliciousVerdict.riskScore}/100 BLOCKED, ${maliciousVerdict.threats.length} threat findings).`
  );

  // 5. Verify Scenario C: Solana Pay QR & URI Encoding
  const invoice = createSolanaPayRequestPayload({
    recipient: DEMO_SAFE_RECIPIENT,
    amountSol: 0.05,
    label: "Sentinel DeFi",
    message: "Verified Invoice",
    splitCount: 2,
  });
  assert.ok(invoice.url.startsWith(`solana:${DEMO_SAFE_RECIPIENT}?amount=0.05`));
  const svg = await renderSolanaPayQrSvg(invoice.url);
  assert.ok(svg.includes("<svg"), "Valid SVG QR generated");
  console.log(
    `[PASS] Scenario C Solana Pay QR & URI verified (${invoice.url}).`
  );

  // 6. Verify /api/agent Next.js App Router POST endpoint across all 3 scenarios
  for (const scenario of ["SCENARIO_A", "SCENARIO_B", "SCENARIO_C"] as const) {
    const req = new NextRequest("http://localhost:3000/api/agent", {
      method: "POST",
      body: JSON.stringify({
        prompt: "",
        presetScenario: scenario,
        policyMaxTxSol: 0.5,
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.ok, true);
    console.log(
      `[PASS] POST /api/agent (${scenario}) -> ${json.intent.action} | ${json.verdict.verdict} (${json.verdict.riskScore}/100)`
    );
  }

  console.log("\nALL SOLANA SENTINEL MVP CHECKS PASSED!");
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
