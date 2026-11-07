export type IntentActionType =
  | "TRANSFER"
  | "SOLANA_PAY_REQUEST"
  | "SECURITY_SIMULATION"
  | "UPDATE_POLICY";

export type SecurityVerdictLevel = "SAFE" | "CAUTION" | "BLOCKED";

export interface GuardPolicyState {
  authority: string;
  policyPda: string;
  bump: number;
  maxTxSol: number;
  maxTxLamports: number;
  requireAiAudit: boolean;
  maxRiskScore: number;
  safeTxCount: number;
  blockedAttemptCount: number;
  totalVolumeSol: number;
  whitelistedPrograms: string[];
  onChainDeployed: boolean;
  lastIntentHashHex: string;
}

export interface ParsedIntent {
  action: IntentActionType;
  rawPrompt: string;
  summary: string;
  amountSol?: number;
  recipient?: string;
  label?: string;
  message?: string;
  splitCount?: number;
  newMaxTxSol?: number;
  requireAiAudit?: boolean;
  simulationScenario?:
    | "SAFE_TRANSFER"
    | "MALICIOUS_DRAINER"
    | "RAW_BASE64"
    | "CUSTOM";
  rawTxBase64?: string;
  parserSource: "openai" | "gemini" | "deterministic-engine";
}

export interface BalanceDelta {
  account: string;
  label: string;
  deltaSol: number;
  direction: "OUTFLOW" | "INFLOW" | "NEUTRAL";
}

export interface ThreatFinding {
  id: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";
  code: string;
  title: string;
  description: string;
  instructionIndex?: number;
  programId?: string;
}

export interface SimulationTelemetry {
  rpcEndpoint: string;
  cluster: "devnet";
  simulatedOnChain: boolean;
  slot: number;
  unitsConsumed: number;
  logs: string[];
  rpcError: string | null;
  programIds: string[];
  instructionCount: number;
  senderSolBalance: number | null;
  usedCanaryDryRun: boolean;
}

export interface SolanaPayInvoicePayload {
  url: string;
  recipient: string;
  amountSol: number;
  reference: string;
  label: string;
  message: string;
  memo: string;
  splitCount?: number;
  perPartySol?: number;
}

export interface SecurityVerdict {
  verdict: SecurityVerdictLevel;
  riskScore: number;
  anchorGuardPassed: boolean;
  anchorRejectionCode: string | null;
  plainEnglishExplanation: string;
  intentHashHex: string;
  intentHashBytes: number[];
  policyPda: string;
  balanceDeltas: BalanceDelta[];
  threats: ThreatFinding[];
  simulation: SimulationTelemetry;
  unsignedTxBase64?: string;
  solanaPayPayload?: SolanaPayInvoicePayload;
}

export interface AgentApiRequest {
  prompt: string;
  walletAddress?: string;
  policyMaxTxSol?: number;
  requireAiAudit?: boolean;
  presetScenario?: "SCENARIO_A" | "SCENARIO_B" | "SCENARIO_C";
  rawTxBase64?: string;
}

export interface AgentApiResponse {
  ok: boolean;
  intent: ParsedIntent;
  verdict: SecurityVerdict;
  timestamp: string;
  error?: string;
}

export interface AuditTrailEntry {
  id: string;
  timestamp: string;
  intentSummary: string;
  action: IntentActionType;
  riskScore: number;
  verdict: SecurityVerdictLevel;
  computeUnits: number;
  amountSol: number | null;
  recipient: string | null;
  intentHashHex: string;
  policyPda: string;
  executionMode:
    | "ANCHOR_CPI"
    | "DEVNET_MEMO_VAULT"
    | "SOLANA_PAY"
    | "FIREWALL_BLOCKED"
    | "POLICY_SYNC";
  signature: string | null;
  explorerUrl: string | null;
}
