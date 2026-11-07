import { PublicKey, SystemProgram } from "@solana/web3.js";

export const SOLANA_DEVNET_RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";

export const SOLANA_CLUSTER = "devnet" as const;

export const SENTINEL_PROGRAM_ID_STR =
  process.env.NEXT_PUBLIC_SENTINEL_PROGRAM_ID ||
  "FJCh3bosN1DbKe4mpxCMvgosqhx7niPY7ZDajGk1D9ib";

export const SENTINEL_PROGRAM_ID = new PublicKey(SENTINEL_PROGRAM_ID_STR);

export const SPL_MEMO_PROGRAM_ID_STR =
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
export const SPL_MEMO_PROGRAM_ID = new PublicKey(SPL_MEMO_PROGRAM_ID_STR);

export const SPL_TOKEN_PROGRAM_ID_STR =
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const SPL_TOKEN_PROGRAM_ID = new PublicKey(SPL_TOKEN_PROGRAM_ID_STR);

export const COMPUTE_BUDGET_PROGRAM_ID_STR =
  "ComputeBudget111111111111111111111111111111";

/** Verified on-curve Ed25519 demo addresses for instant 1-click judge testing on Devnet */
export const DEMO_SAFE_RECIPIENT =
  "8fCSyTjJwUY44JzERMZeJVHUNSKWZ3n38ZKQNdGjDgJ2";

export const DEMO_BOUNTY_TREASURY =
  "D98dbGhESy2BX2dYEeisE6AynRjmDaphNjUgyqW3L4mW";

/** Mock malicious wallet-drainer sink flagged by Sentinel's Threat Intelligence Registry */
export const MOCK_MALICIOUS_DRAINER =
  "deq8nzTCTTgQLFuz7wfnfpVQPD83Y6Q3vYrcREgDgrN";

export const KNOWN_MALICIOUS_ADDRESSES = new Set<string>([
  MOCK_MALICIOUS_DRAINER,
]);

export const DEFAULT_WHITELISTED_PROGRAMS: string[] = [
  SystemProgram.programId.toBase58(),
  SPL_MEMO_PROGRAM_ID_STR,
  COMPUTE_BUDGET_PROGRAM_ID_STR,
];

export const MAX_ALLOWED_AI_RISK_SCORE = 30;
export const DEFAULT_POLICY_MAX_TX_SOL = 0.5;
export const ESTIMATED_BASE_FEE_SOL = 0.000005;

export function getExplorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

export function getExplorerAddressUrl(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

export function shortenAddress(address: string, chars = 4): string {
  if (!address || address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}
