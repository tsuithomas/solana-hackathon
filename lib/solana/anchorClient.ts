import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  DEFAULT_POLICY_MAX_TX_SOL,
  DEFAULT_WHITELISTED_PROGRAMS,
  MAX_ALLOWED_AI_RISK_SCORE,
  SENTINEL_PROGRAM_ID,
} from "./constants";
import { SENTINEL_VAULT_IDL } from "./idl/sentinel_vault";
import type { GuardPolicyState } from "../types/sentinel";

const POLICY_SEED = Buffer.from("policy", "utf8");

/**
 * Deterministically derives `[b"policy", authority.toBuffer()]` PDA for `sentinel_vault`.
 */
export function deriveGuardPolicyPda(
  authority: PublicKey,
  programId: PublicKey = SENTINEL_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [POLICY_SEED, authority.toBuffer()],
    programId
  );
}

function writeU64LE(buf: Uint8Array, offset: number, value: bigint): void {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  view.setBigUint64(offset, value, true);
}

function readU64LE(buf: Uint8Array, offset: number): bigint {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return view.getBigUint64(offset, true);
}

/**
 * Encodes `sentinel_vault::initialize_policy(max_tx_lamports: u64, require_ai_audit: bool)`
 * using exact Anchor Borsh wire layout: `[8-byte discriminator][u64 LE][u8 bool]`.
 */
export function buildInitializePolicyInstruction(params: {
  authority: PublicKey;
  maxTxLamports: bigint | number;
  requireAiAudit: boolean;
  programId?: PublicKey;
}): TransactionInstruction {
  const programId = params.programId ?? SENTINEL_PROGRAM_ID;
  const [policyPda] = deriveGuardPolicyPda(params.authority, programId);

  const data = new Uint8Array(8 + 8 + 1);
  data.set(SENTINEL_VAULT_IDL.instructions[0].discriminator, 0);
  writeU64LE(data, 8, BigInt(params.maxTxLamports));
  data[16] = params.requireAiAudit ? 1 : 0;

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: policyPda, isSigner: false, isWritable: true },
      { pubkey: params.authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

/**
 * Encodes `sentinel_vault::update_policy(max_tx_lamports, require_ai_audit, whitelisted_programs)`
 */
export function buildUpdatePolicyInstruction(params: {
  authority: PublicKey;
  maxTxLamports: bigint | number;
  requireAiAudit: boolean;
  whitelistedPrograms: PublicKey[];
  programId?: PublicKey;
}): TransactionInstruction {
  const programId = params.programId ?? SENTINEL_PROGRAM_ID;
  const [policyPda] = deriveGuardPolicyPda(params.authority, programId);

  const vecLen = params.whitelistedPrograms.length;
  const data = new Uint8Array(8 + 8 + 1 + 4 + vecLen * 32);
  data.set(SENTINEL_VAULT_IDL.instructions[1].discriminator, 0);
  writeU64LE(data, 8, BigInt(params.maxTxLamports));
  data[16] = params.requireAiAudit ? 1 : 0;

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  view.setUint32(17, vecLen, true);
  params.whitelistedPrograms.forEach((pk, idx) => {
    data.set(pk.toBytes(), 21 + idx * 32);
  });

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: policyPda, isSigner: false, isWritable: true },
      { pubkey: params.authority, isSigner: true, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

/**
 * Encodes `sentinel_vault::execute_guarded_transfer(amount: u64, ai_risk_score: u8, intent_hash: [u8; 32])`
 * Wire layout: `[8-byte discriminator][u64 LE amount][u8 ai_risk_score][32-byte intent_hash]` = 49 bytes.
 */
export function buildExecuteGuardedTransferInstruction(params: {
  authority: PublicKey;
  recipient: PublicKey;
  amountLamports: bigint | number;
  aiRiskScore: number;
  intentHash: Uint8Array;
  programId?: PublicKey;
}): TransactionInstruction {
  if (params.intentHash.length !== 32) {
    throw new Error("intentHash must be exactly 32 bytes (SHA-256)");
  }
  const programId = params.programId ?? SENTINEL_PROGRAM_ID;
  const [policyPda] = deriveGuardPolicyPda(params.authority, programId);

  const data = new Uint8Array(8 + 8 + 1 + 32);
  data.set(SENTINEL_VAULT_IDL.instructions[2].discriminator, 0);
  writeU64LE(data, 8, BigInt(params.amountLamports));
  data[16] = params.aiRiskScore & 0xff;
  data.set(params.intentHash, 17);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: policyPda, isSigner: false, isWritable: true },
      { pubkey: params.authority, isSigner: true, isWritable: true },
      { pubkey: params.recipient, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

/**
 * Decodes an on-chain `GuardPolicy` PDA account buffer if deployed & initialized on Devnet,
 * or synthesizes the deterministic default policy state for zero-setup Devnet usage.
 */
export async function fetchOrDeriveGuardPolicy(
  connection: Connection,
  authority: PublicKey,
  localOverrides?: {
    maxTxSol?: number;
    requireAiAudit?: boolean;
    safeTxCount?: number;
    blockedAttemptCount?: number;
    totalVolumeSol?: number;
  }
): Promise<GuardPolicyState> {
  const [policyPda, bump] = deriveGuardPolicyPda(authority);
  const fallbackMaxSol = localOverrides?.maxTxSol ?? DEFAULT_POLICY_MAX_TX_SOL;

  try {
    const [programInfo, policyInfo] = await Promise.all([
      connection.getAccountInfo(SENTINEL_PROGRAM_ID),
      connection.getAccountInfo(policyPda),
    ]);

    const programDeployed = Boolean(programInfo?.executable);

    if (programDeployed && policyInfo && policyInfo.data.length >= 98) {
      const buf = new Uint8Array(policyInfo.data);
      const disc = SENTINEL_VAULT_IDL.accounts[0].discriminator;
      const matchesDisc = disc.every((byte, idx) => buf[idx] === byte);

      if (matchesDisc) {
        const ownerPk = new PublicKey(buf.slice(8, 40));
        const storedBump = buf[40];
        const maxTxLamports = Number(readU64LE(buf, 41));
        const requireAiAudit = buf[49] === 1;
        const maxRiskScore = buf[50];
        const safeTxCount = Number(readU64LE(buf, 51));
        const totalVolumeLamports = Number(readU64LE(buf, 59));
        const lastIntentHashHex = Buffer.from(buf.slice(67, 99)).toString("hex");

        const whitelistedPrograms: string[] = [];
        if (buf.length >= 111) {
          const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
          const vecLen = Math.min(view.getUint32(107, true), 8);
          for (let i = 0; i < vecLen; i++) {
            const start = 111 + i * 32;
            if (start + 32 <= buf.length) {
              whitelistedPrograms.push(
                new PublicKey(buf.slice(start, start + 32)).toBase58()
              );
            }
          }
        }

        return {
          authority: ownerPk.toBase58(),
          policyPda: policyPda.toBase58(),
          bump: storedBump,
          maxTxSol: maxTxLamports / LAMPORTS_PER_SOL,
          maxTxLamports,
          requireAiAudit,
          maxRiskScore,
          safeTxCount,
          blockedAttemptCount: localOverrides?.blockedAttemptCount ?? 0,
          totalVolumeSol: totalVolumeLamports / LAMPORTS_PER_SOL,
          whitelistedPrograms:
            whitelistedPrograms.length > 0
              ? whitelistedPrograms
              : DEFAULT_WHITELISTED_PROGRAMS,
          onChainDeployed: true,
          lastIntentHashHex,
        };
      }
    }

    return {
      authority: authority.toBase58(),
      policyPda: policyPda.toBase58(),
      bump,
      maxTxSol: fallbackMaxSol,
      maxTxLamports: Math.round(fallbackMaxSol * LAMPORTS_PER_SOL),
      requireAiAudit: localOverrides?.requireAiAudit ?? true,
      maxRiskScore: MAX_ALLOWED_AI_RISK_SCORE,
      safeTxCount: localOverrides?.safeTxCount ?? 0,
      blockedAttemptCount: localOverrides?.blockedAttemptCount ?? 0,
      totalVolumeSol: localOverrides?.totalVolumeSol ?? 0,
      whitelistedPrograms: DEFAULT_WHITELISTED_PROGRAMS,
      onChainDeployed: programDeployed,
      lastIntentHashHex: "0".repeat(64),
    };
  } catch {
    return {
      authority: authority.toBase58(),
      policyPda: policyPda.toBase58(),
      bump,
      maxTxSol: fallbackMaxSol,
      maxTxLamports: Math.round(fallbackMaxSol * LAMPORTS_PER_SOL),
      requireAiAudit: localOverrides?.requireAiAudit ?? true,
      maxRiskScore: MAX_ALLOWED_AI_RISK_SCORE,
      safeTxCount: localOverrides?.safeTxCount ?? 0,
      blockedAttemptCount: localOverrides?.blockedAttemptCount ?? 0,
      totalVolumeSol: localOverrides?.totalVolumeSol ?? 0,
      whitelistedPrograms: DEFAULT_WHITELISTED_PROGRAMS,
      onChainDeployed: false,
      lastIntentHashHex: "0".repeat(64),
    };
  }
}
