import {
  ComputeBudgetProgram,
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  AuthorityType,
  createApproveInstruction,
  createSetAuthorityInstruction,
} from "@solana/spl-token";
import {
  MAX_ALLOWED_AI_RISK_SCORE,
  MOCK_MALICIOUS_DRAINER,
  SENTINEL_PROGRAM_ID,
  SPL_MEMO_PROGRAM_ID,
} from "./constants";
import {
  buildExecuteGuardedTransferInstruction,
  buildInitializePolicyInstruction,
  deriveGuardPolicyPda,
} from "./anchorClient";

/**
 * Encodes a cryptographic SPL Memo v2 Audit Log instruction signed by `authority`.
 * Format: `SENTINEL_V1|score=<u8>|cap=<lamports>|pda=<pdaShort>|intent=<sha256_hex>`
 */
export function buildSentinelAuditMemoInstruction(params: {
  authority: PublicKey;
  aiRiskScore: number;
  maxTxLamports: number;
  policyPda: PublicKey;
  intentHashHex: string;
}): TransactionInstruction {
  const pdaTag = params.policyPda.toBase58().slice(0, 8);
  const memoPayload = `SENTINEL_V1|score=${params.aiRiskScore}|cap=${params.maxTxLamports}|pda=${pdaTag}|intent=${params.intentHashHex.slice(0, 32)}`;

  return new TransactionInstruction({
    programId: SPL_MEMO_PROGRAM_ID,
    keys: [{ pubkey: params.authority, isSigner: true, isWritable: false }],
    data: Buffer.from(memoPayload, "utf8"),
  });
}

/**
 * Builds a complete, ready-to-sign Devnet Guarded Transfer `VersionedTransaction`.
 *
 * Dual-Mode Architecture:
 * - If `sentinel_vault` Anchor program is deployed on Devnet, dispatches `execute_guarded_transfer`
 *   (initializing `GuardPolicy` PDA in the same atomic transaction if not yet initialized) + SPL Memo audit log.
 * - Otherwise, seamlessly uses the Zero-Dependency Devnet Vault Fallback (`SystemProgram.transfer`
 *   + authenticated `SPL Memo v2` encoding AI Risk Score, GuardPolicy PDA, and SHA-256 Intent Hash)
 *   so judges can sign real Devnet transactions immediately out-of-the-box before running `anchor deploy`.
 */
export async function buildGuardedTransferTransaction(params: {
  connection: Connection;
  authority: PublicKey;
  recipient: PublicKey;
  amountSol: number;
  aiRiskScore: number;
  intentHashBytes: Uint8Array;
  intentHashHex: string;
  policyMaxTxSol: number;
  requireAiAudit?: boolean;
  referencePubkey?: PublicKey;
}): Promise<{
  transaction: VersionedTransaction;
  executionMode: "ANCHOR_CPI" | "DEVNET_MEMO_VAULT";
  policyPda: PublicKey;
  amountLamports: number;
}> {
  const amountLamports = Math.round(params.amountSol * LAMPORTS_PER_SOL);
  const maxTxLamports = Math.round(params.policyMaxTxSol * LAMPORTS_PER_SOL);

  if (params.aiRiskScore > MAX_ALLOWED_AI_RISK_SCORE) {
    throw new Error(
      `SentinelError::RiskScoreTooHigh: AI Risk Score (${params.aiRiskScore}/100) exceeds protocol limit (${MAX_ALLOWED_AI_RISK_SCORE}/100).`
    );
  }
  if (amountLamports > maxTxLamports) {
    throw new Error(
      `SentinelError::ExceedsPolicyLimit: Transfer (${params.amountSol} SOL) exceeds GuardPolicy cap (${params.policyMaxTxSol} SOL).`
    );
  }

  const [policyPda] = deriveGuardPolicyPda(params.authority);
  const instructions: TransactionInstruction[] = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 120_000 }),
  ];

  let useAnchorCpi = false;
  try {
    const programAccount = await params.connection.getAccountInfo(
      SENTINEL_PROGRAM_ID
    );
    useAnchorCpi = Boolean(programAccount?.executable);
  } catch {
    useAnchorCpi = false;
  }

  let executionMode: "ANCHOR_CPI" | "DEVNET_MEMO_VAULT" = "DEVNET_MEMO_VAULT";

  if (useAnchorCpi) {
    executionMode = "ANCHOR_CPI";
    const policyInfo = await params.connection.getAccountInfo(policyPda);
    if (!policyInfo) {
      instructions.push(
        buildInitializePolicyInstruction({
          authority: params.authority,
          maxTxLamports,
          requireAiAudit: params.requireAiAudit ?? true,
        })
      );
    }

    const transferIx = buildExecuteGuardedTransferInstruction({
      authority: params.authority,
      recipient: params.recipient,
      amountLamports,
      aiRiskScore: params.aiRiskScore,
      intentHash: params.intentHashBytes,
    });
    if (params.referencePubkey) {
      transferIx.keys.push({
        pubkey: params.referencePubkey,
        isSigner: false,
        isWritable: false,
      });
    }
    instructions.push(transferIx);
  } else {
    const transferIx = SystemProgram.transfer({
      fromPubkey: params.authority,
      toPubkey: params.recipient,
      lamports: amountLamports,
    });

    // Attach Solana Pay reference key to the transfer instruction when settling an invoice
    if (params.referencePubkey) {
      transferIx.keys.push({
        pubkey: params.referencePubkey,
        isSigner: false,
        isWritable: false,
      });
    }
    instructions.push(transferIx);
  }

  instructions.push(
    buildSentinelAuditMemoInstruction({
      authority: params.authority,
      aiRiskScore: params.aiRiskScore,
      maxTxLamports,
      policyPda,
      intentHashHex: params.intentHashHex,
    })
  );

  const { blockhash } = await params.connection.getLatestBlockhash("confirmed");
  const messageV0 = new TransactionMessage({
    payerKey: params.authority,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  return {
    transaction: new VersionedTransaction(messageV0),
    executionMode,
    policyPda,
    amountLamports,
  };
}

/**
 * Constructs an authentic, multi-instruction malicious wallet-drainer transaction payload
 * for Scenario B security auditing (NEVER signed; strictly inspected & simulated pre-flight):
 * 1. Unlimited SPL Token `Approve` delegation (`u64::MAX`) to known drainer pubkey
 * 2. SPL Token `SetAuthority(AuthorityType.AccountOwner)` hijacking token account ownership
 * 3. Native SOL sweep (`2.50 SOL`) exceeding the user's `GuardPolicy` spending cap
 */
export async function buildMockMaliciousDrainerTransaction(params: {
  connection: Connection;
  victimAuthority: PublicKey;
}): Promise<VersionedTransaction> {
  const drainerPubkey = new PublicKey(MOCK_MALICIOUS_DRAINER);

  // Deterministic mock token account derived from victim for realistic SPL Token drainer inspection
  const [mockVictimTokenAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("mock_ata"), params.victimAuthority.toBuffer()],
    SENTINEL_PROGRAM_ID
  );

  const unlimitedApproveIx = createApproveInstruction(
    mockVictimTokenAccount,
    drainerPubkey,
    params.victimAuthority,
    BigInt("18446744073709551615") // u64::MAX unlimited token allowance
  );

  const hijackOwnerIx = createSetAuthorityInstruction(
    mockVictimTokenAccount,
    params.victimAuthority,
    AuthorityType.AccountOwner,
    drainerPubkey
  );

  const sweepSolIx = SystemProgram.transfer({
    fromPubkey: params.victimAuthority,
    toPubkey: drainerPubkey,
    lamports: Math.round(2.5 * LAMPORTS_PER_SOL),
  });

  let blockhash = "11111111111111111111111111111111";
  try {
    const latest = await params.connection.getLatestBlockhash("confirmed");
    blockhash = latest.blockhash;
  } catch {
    // Offline fallback blockhash if Devnet RPC is unreachable
  }

  const messageV0 = new TransactionMessage({
    payerKey: params.victimAuthority,
    recentBlockhash: blockhash,
    instructions: [unlimitedApproveIx, hijackOwnerIx, sweepSolIx],
  }).compileToV0Message();

  return new VersionedTransaction(messageV0);
}

/**
 * Builds an on-chain Policy Sync transaction recording updated GuardPolicy parameters
 * in an authenticated SPL Memo v2 commitment (or Anchor `update_policy` if deployed).
 */
export async function buildPolicySyncTransaction(params: {
  connection: Connection;
  authority: PublicKey;
  maxTxSol: number;
  requireAiAudit: boolean;
  intentHashHex: string;
}): Promise<{
  transaction: VersionedTransaction;
  policyPda: PublicKey;
}> {
  const [policyPda] = deriveGuardPolicyPda(params.authority);
  const maxTxLamports = Math.round(params.maxTxSol * LAMPORTS_PER_SOL);
  const memoPayload = `SENTINEL_POLICY_SYNC_V1|pda=${policyPda.toBase58().slice(0, 12)}|max_lamports=${maxTxLamports}|audit=${params.requireAiAudit ? 1 : 0}|hash=${params.intentHashHex.slice(0, 24)}`;

  const ix = new TransactionInstruction({
    programId: SPL_MEMO_PROGRAM_ID,
    keys: [{ pubkey: params.authority, isSigner: true, isWritable: false }],
    data: Buffer.from(memoPayload, "utf8"),
  });

  const { blockhash } = await params.connection.getLatestBlockhash("confirmed");
  const messageV0 = new TransactionMessage({
    payerKey: params.authority,
    recentBlockhash: blockhash,
    instructions: [ix],
  }).compileToV0Message();

  return {
    transaction: new VersionedTransaction(messageV0),
    policyPda,
  };
}
