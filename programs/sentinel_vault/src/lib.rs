use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};

declare_id!("FJCh3bosN1DbKe4mpxCMvgosqhx7niPY7ZDajGk1D9ib");

/// Seed prefix for deriving deterministic per-wallet GuardPolicy PDAs.
pub const POLICY_SEED: &[u8] = b"policy";

/// Hard protocol ceiling for AI-evaluated pre-signature risk scores (0..=100).
/// Any transaction scoring strictly above 30 is rejected atomically on-chain.
pub const MAX_ALLOWED_AI_RISK_SCORE: u8 = 30;

/// Maximum number of whitelisted target program IDs stored inside a GuardPolicy PDA.
pub const MAX_WHITELISTED_PROGRAMS: usize = 8;

/// Canonical SPL Memo v2 Program ID whitelisted by default alongside System Program.
pub const SPL_MEMO_PROGRAM_ID: Pubkey = pubkey!("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

#[program]
pub mod sentinel_vault {
    use super::*;

    /// Initializes a user-specific `GuardPolicy` PDA `[b"policy", authority.key().as_ref()]`
    /// that enforces per-transaction spending caps, AI Risk Firewall attestation checks,
    /// whitelisted downstream programs, and cumulative cryptographic audit telemetry.
    pub fn initialize_policy(
        ctx: Context<InitializePolicy>,
        max_tx_lamports: u64,
        require_ai_audit: bool,
    ) -> Result<()> {
        require!(max_tx_lamports > 0, SentinelError::InvalidPolicyLimit);

        let clock = Clock::get()?;
        let policy = &mut ctx.accounts.policy;

        policy.authority = ctx.accounts.authority.key();
        policy.bump = ctx.bumps.policy;
        policy.max_tx_lamports = max_tx_lamports;
        policy.require_ai_audit = require_ai_audit;
        policy.max_risk_score = MAX_ALLOWED_AI_RISK_SCORE;
        policy.safe_tx_count = 0;
        policy.total_volume_lamports = 0;
        policy.last_intent_hash = [0u8; 32];
        policy.last_updated_ts = clock.unix_timestamp;
        policy.whitelisted_programs = vec![system_program::ID, SPL_MEMO_PROGRAM_ID];

        emit!(PolicyConfigured {
            authority: policy.authority,
            policy_pda: policy.key(),
            max_tx_lamports,
            require_ai_audit,
            whitelisted_count: policy.whitelisted_programs.len() as u8,
            timestamp: clock.unix_timestamp,
        });

        msg!(
            "Solana Sentinel GuardPolicy initialized: authority={}, max_tx_lamports={}, require_ai_audit={}",
            policy.authority,
            max_tx_lamports,
            require_ai_audit
        );

        Ok(())
    }

    /// Updates an existing `GuardPolicy` PDA owned by `authority`.
    pub fn update_policy(
        ctx: Context<UpdatePolicy>,
        max_tx_lamports: u64,
        require_ai_audit: bool,
        whitelisted_programs: Vec<Pubkey>,
    ) -> Result<()> {
        require!(max_tx_lamports > 0, SentinelError::InvalidPolicyLimit);
        require!(
            whitelisted_programs.len() <= MAX_WHITELISTED_PROGRAMS,
            SentinelError::TooManyWhitelistedPrograms
        );

        let clock = Clock::get()?;
        let policy = &mut ctx.accounts.policy;

        policy.max_tx_lamports = max_tx_lamports;
        policy.require_ai_audit = require_ai_audit;
        if !whitelisted_programs.is_empty() {
            policy.whitelisted_programs = whitelisted_programs;
        }
        policy.last_updated_ts = clock.unix_timestamp;

        emit!(PolicyConfigured {
            authority: policy.authority,
            policy_pda: policy.key(),
            max_tx_lamports,
            require_ai_audit,
            whitelisted_count: policy.whitelisted_programs.len() as u8,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Executes an AI-audited, policy-guarded native SOL transfer via System Program CPI,
    /// anchoring the SHA-256 natural-language `intent_hash` and `ai_risk_score` on-chain.
    ///
    /// Security invariants enforced atomically before any lamports move:
    /// 1. `amount > 0` (`InvalidTransferAmount`)
    /// 2. `ai_risk_score <= 30` (`RiskScoreTooHigh`)
    /// 3. `amount <= policy.max_tx_lamports` (`ExceedsPolicyLimit`)
    /// 4. Non-zero `intent_hash` when `policy.require_ai_audit == true` (`MissingAuditIntentHash`)
    /// 5. Target CPI program is present in `policy.whitelisted_programs` (`UnauthorizedProgram`)
    pub fn execute_guarded_transfer(
        ctx: Context<ExecuteGuardedTransfer>,
        amount: u64,
        ai_risk_score: u8,
        intent_hash: [u8; 32],
    ) -> Result<()> {
        require!(amount > 0, SentinelError::InvalidTransferAmount);

        let policy = &mut ctx.accounts.policy;

        // 1. Enforce AI Risk Firewall threshold (0..=30 permitted; >30 rejected on-chain)
        require!(
            ai_risk_score <= MAX_ALLOWED_AI_RISK_SCORE && ai_risk_score <= policy.max_risk_score,
            SentinelError::RiskScoreTooHigh
        );

        // 2. Enforce per-transaction GuardPolicy spending cap
        require!(
            amount <= policy.max_tx_lamports,
            SentinelError::ExceedsPolicyLimit
        );

        // 3. Enforce cryptographic SHA-256 intent hash presence when AI audit is mandatory
        if policy.require_ai_audit {
            require!(
                intent_hash != [0u8; 32],
                SentinelError::MissingAuditIntentHash
            );
        }

        // 4. Verify downstream System Program is whitelisted in the user's policy
        if !policy.whitelisted_programs.is_empty() {
            require!(
                policy
                    .whitelisted_programs
                    .contains(&ctx.accounts.system_program.key()),
                SentinelError::UnauthorizedProgram
            );
        }

        // 5. Execute native SOL transfer via Cross-Program Invocation (CPI)
        let cpi_accounts = Transfer {
            from: ctx.accounts.authority.to_account_info(),
            to: ctx.accounts.recipient.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.system_program.to_account_info(), cpi_accounts);
        system_program::transfer(cpi_ctx, amount)?;

        // 6. Update cumulative on-chain audit counters & state commitment
        let clock = Clock::get()?;
        policy.safe_tx_count = policy
            .safe_tx_count
            .checked_add(1)
            .ok_or(SentinelError::ArithmeticOverflow)?;
        policy.total_volume_lamports = policy
            .total_volume_lamports
            .checked_add(amount)
            .ok_or(SentinelError::ArithmeticOverflow)?;
        policy.last_intent_hash = intent_hash;
        policy.last_updated_ts = clock.unix_timestamp;

        // 7. Emit indexable on-chain AuditLogged event
        emit!(AuditLogged {
            authority: ctx.accounts.authority.key(),
            recipient: ctx.accounts.recipient.key(),
            policy_pda: policy.key(),
            amount,
            ai_risk_score,
            intent_hash,
            safe_tx_count: policy.safe_tx_count,
            timestamp: clock.unix_timestamp,
        });

        msg!(
            "Sentinel AuditLogged: tx_index={}, amount={}, risk_score={}/100",
            policy.safe_tx_count,
            amount,
            ai_risk_score
        );

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializePolicy<'info> {
    #[account(
        init,
        payer = authority,
        space = GuardPolicy::LEN,
        seeds = [POLICY_SEED, authority.key().as_ref()],
        bump
    )]
    pub policy: Account<'info, GuardPolicy>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePolicy<'info> {
    #[account(
        mut,
        has_one = authority @ SentinelError::UnauthorizedAuthority,
        seeds = [POLICY_SEED, authority.key().as_ref()],
        bump = policy.bump
    )]
    pub policy: Account<'info, GuardPolicy>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ExecuteGuardedTransfer<'info> {
    #[account(
        mut,
        has_one = authority @ SentinelError::UnauthorizedAuthority,
        seeds = [POLICY_SEED, authority.key().as_ref()],
        bump = policy.bump
    )]
    pub policy: Account<'info, GuardPolicy>,

    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Recipient can be any valid SOL system account or wallet receiving native lamports.
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[account]
pub struct GuardPolicy {
    /// Wallet owner authorized to configure this policy and execute guarded transfers (32 bytes)
    pub authority: Pubkey,
    /// Canonical PDA bump seed (1 byte)
    pub bump: u8,
    /// Maximum lamports allowed in a single transaction (8 bytes)
    pub max_tx_lamports: u64,
    /// Whether non-zero AI audit intent hashes are mandatory (1 byte)
    pub require_ai_audit: bool,
    /// Maximum allowed AI risk score, fixed <= 30 (1 byte)
    pub max_risk_score: u8,
    /// Cumulative count of AI-verified safe transactions executed (8 bytes)
    pub safe_tx_count: u64,
    /// Cumulative volume transferred through Sentinel in lamports (8 bytes)
    pub total_volume_lamports: u64,
    /// SHA-256 hash of the latest verified natural-language intent payload (32 bytes)
    pub last_intent_hash: [u8; 32],
    /// Unix timestamp of latest policy update or guarded execution (8 bytes)
    pub last_updated_ts: i64,
    /// Whitelisted downstream CPI program IDs (4 + 32 * 8 = 260 bytes)
    pub whitelisted_programs: Vec<Pubkey>,
}

impl GuardPolicy {
    pub const LEN: usize = 8  // Anchor account discriminator
        + 32                  // authority
        + 1                   // bump
        + 8                   // max_tx_lamports
        + 1                   // require_ai_audit
        + 1                   // max_risk_score
        + 8                   // safe_tx_count
        + 8                   // total_volume_lamports
        + 32                  // last_intent_hash
        + 8                   // last_updated_ts
        + 4 + (32 * MAX_WHITELISTED_PROGRAMS); // whitelisted_programs Vec<Pubkey>
}

#[event]
pub struct PolicyConfigured {
    pub authority: Pubkey,
    pub policy_pda: Pubkey,
    pub max_tx_lamports: u64,
    pub require_ai_audit: bool,
    pub whitelisted_count: u8,
    pub timestamp: i64,
}

#[event]
pub struct AuditLogged {
    pub authority: Pubkey,
    pub recipient: Pubkey,
    pub policy_pda: Pubkey,
    pub amount: u64,
    pub ai_risk_score: u8,
    pub intent_hash: [u8; 32],
    pub safe_tx_count: u64,
    pub timestamp: i64,
}

#[error_code]
pub enum SentinelError {
    #[msg("AI Risk Firewall blocked execution: ai_risk_score exceeds maximum safe threshold (30/100).")]
    RiskScoreTooHigh,
    #[msg("Transfer amount exceeds the user's on-chain GuardPolicy max_tx_lamports spending cap.")]
    ExceedsPolicyLimit,
    #[msg("GuardPolicy requires a valid non-zero 32-byte SHA-256 AI audit intent hash.")]
    MissingAuditIntentHash,
    #[msg("Target CPI program is not whitelisted in the user's GuardPolicy.")]
    UnauthorizedProgram,
    #[msg("Signer does not match the GuardPolicy authority.")]
    UnauthorizedAuthority,
    #[msg("Policy max_tx_lamports must be greater than zero.")]
    InvalidPolicyLimit,
    #[msg("Transfer amount must be greater than zero lamports.")]
    InvalidTransferAmount,
    #[msg("GuardPolicy supports at most 8 whitelisted programs.")]
    TooManyWhitelistedPrograms,
    #[msg("Checked arithmetic overflow while updating on-chain audit counters.")]
    ArithmeticOverflow,
}
