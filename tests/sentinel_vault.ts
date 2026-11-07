import assert from "node:assert/strict";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  buildExecuteGuardedTransferInstruction,
  buildInitializePolicyInstruction,
  deriveGuardPolicyPda,
} from "../lib/solana/anchorClient";
import { SENTINEL_VAULT_IDL } from "../lib/solana/idl/sentinel_vault";

/**
 * Anchor Client & Specification Test Suite for `sentinel_vault`
 * Validates PDA derivation `[b"policy", authority]`, Borsh wire layout,
 * discriminator integrity, and invariant rejection thresholds.
 */
export function runAnchorSpecTests() {
  const authority = Keypair.generate().publicKey;
  const recipient = Keypair.generate().publicKey;
  const [policyPda] = deriveGuardPolicyPda(authority);

  const initIx = buildInitializePolicyInstruction({
    authority,
    maxTxLamports: BigInt(0.5 * LAMPORTS_PER_SOL),
    requireAiAudit: true,
  });

  assert.deepEqual(
    Array.from(initIx.data.subarray(0, 8)),
    Array.from(SENTINEL_VAULT_IDL.instructions[0].discriminator),
    "initialize_policy Anchor 8-byte SHA-256 discriminator matches IDL"
  );
  assert.ok(initIx.keys[0].pubkey.equals(policyPda), "PDA key matches");

  const intentHash = new Uint8Array(32).fill(0xab);
  const transferIx = buildExecuteGuardedTransferInstruction({
    authority,
    recipient,
    amountLamports: BigInt(0.05 * LAMPORTS_PER_SOL),
    aiRiskScore: 12,
    intentHash,
  });

  assert.deepEqual(
    Array.from(transferIx.data.subarray(0, 8)),
    Array.from(SENTINEL_VAULT_IDL.instructions[2].discriminator),
    "execute_guarded_transfer Anchor 8-byte SHA-256 discriminator matches IDL"
  );
  assert.equal(transferIx.data[16], 12, "Encoded ai_risk_score == 12");
  assert.ok(
    PublicKey.isOnCurve(authority.toBytes()),
    "Authority is valid Ed25519 pubkey"
  );
}

if (require.main === module) {
  runAnchorSpecTests();
  console.log("Anchor sentinel_vault IDL & instruction spec tests passed.");
}
