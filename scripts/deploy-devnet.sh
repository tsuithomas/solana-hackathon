#!/usr/bin/env bash
set -euo pipefail

EXPECTED_PROGRAM_ID="D6Fr8JAfScQSQXdjGYvH3R9eSt9ZStavCciw8oRqE3v3"
REPO_ROOT="/Users/thomastsui/Desktop/solana-hackathon"

cd "$REPO_ROOT"

echo "=== Step 1: Checking Toolchain ==="
rustc --version
solana --version
ANCHOR_VER="$(anchor --version)"
echo "$ANCHOR_VER"
if [[ "$ANCHOR_VER" != *"0.30.1"* ]]; then
  echo "STOP: Expected anchor-cli 0.30.1, got: $ANCHOR_VER"
  echo "Run: avm install 0.30.1 && avm use 0.30.1"
  exit 1
fi

echo ""
echo "=== Step 2: Running anchor build (--no-idl for Rust 1.89+ host compatibility) ==="
anchor build --no-idl

echo ""
echo "=== Step 3: Verifying anchor keys list ==="
KEYS_OUT="$(anchor keys list)"
echo "$KEYS_OUT"
if ! printf '%s\n' "$KEYS_OUT" | grep -q "$EXPECTED_PROGRAM_ID"; then
  echo "STOP: Program ID mismatch! Expected $EXPECTED_PROGRAM_ID"
  exit 1
fi

echo ""
echo "=== Step 4: Configuring Devnet & Checking Balance ==="
solana config set --url devnet
WALLET_ADDR="$(solana address)"
BAL="$(solana balance --url devnet | awk '{print $1}')"
echo "Deployer Wallet: $WALLET_ADDR"
echo "Current Devnet Balance: $BAL SOL"

NEED_AIRDROP="$(awk -v b="$BAL" 'BEGIN { print (b + 0 < 3.0) ? "1" : "0" }')"
if [[ "$NEED_AIRDROP" == "1" ]]; then
  echo "Balance is under 3 SOL ($BAL SOL). Requesting 2 SOL Devnet airdrop..."
  AIRDROP_OK=0
  for attempt in 1 2 3; do
    echo "Airdrop attempt $attempt/3..."
    if solana airdrop 2 --url devnet; then
      AIRDROP_OK=1
      break
    fi
    if [[ "$attempt" -lt 3 ]]; then
      echo "Airdrop rate-limited or failed; waiting 5s before retry..."
      sleep 5
    fi
  done

  BAL="$(solana balance --url devnet | awk '{print $1}')"
  ENOUGH_FOR_INITIAL_DEPLOY="$(awk -v b="$BAL" 'BEGIN { print (b + 0 >= 1.85) ? "1" : "0" }')"

  if [[ "$AIRDROP_OK" -ne 1 && "$ENOUGH_FOR_INITIAL_DEPLOY" != "1" ]]; then
    echo ""
    echo "STOP: Devnet RPC airdrop rate-limited after 3 attempts (current balance: $BAL SOL)."
    echo "Please visit https://faucet.solana.com manually (select Devnet -> 5 SOL, or at least 2 SOL) and fund:"
    echo "  $WALLET_ADDR"
    echo "Then re-run: bash /Users/thomastsui/Desktop/solana-hackathon/scripts/deploy-devnet.sh"
    exit 1
  elif [[ "$AIRDROP_OK" -ne 1 ]]; then
    echo "CLI airdrop rate-limited, but wallet has $BAL SOL (>= 1.85 SOL needed for 245 KB initial deploy). Proceeding..."
  else
    echo "Updated Devnet Balance: $BAL SOL"
  fi
fi

echo ""
echo "=== Step 5: Deploying sentinel_vault to Solana Devnet ==="
DEPLOY_LOG="$(mktemp)"
anchor deploy --provider.cluster devnet 2>&1 | tee "$DEPLOY_LOG"
DEPLOY_SIG="$(grep -Eo 'Signature: [1-9A-HJ-NP-Za-km-z]{64,90}' "$DEPLOY_LOG" | awk '{print $2}' | tail -n 1 || true)"
rm -f "$DEPLOY_LOG"

echo ""
echo "=== Step 6: Verifying Deployed Program on Devnet ==="
PROG_SHOW="$(solana program show "$EXPECTED_PROGRAM_ID" --url devnet)"
echo "$PROG_SHOW"

FINAL_BAL="$(solana balance --url devnet)"

echo ""
echo "=========================================================="
echo "SOLANA SENTINEL DEVNET DEPLOYMENT SUMMARY"
echo "=========================================================="
echo "Program Id:               $EXPECTED_PROGRAM_ID"
echo "Deploy Signature:         ${DEPLOY_SIG:-See deploy output above}"
echo "Remaining Devnet Balance: $FINAL_BAL"
echo "----------------------------------------------------------"
echo "$PROG_SHOW"
echo "=========================================================="
