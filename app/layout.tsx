import type { Metadata } from "next";
import "./globals.css";
import { SolanaWalletProvider } from "@/components/providers/SolanaWalletProvider";

export const metadata: Metadata = {
  title:
    "Solana Sentinel | AI-Powered DeFi Risk Firewall & On-Chain Audit Vault",
  description:
    "Natural-Language DeFi Copilot, Pre-Signature Solana RPC Transaction Simulation Firewall, Solana Pay Settlement & Custom Anchor PDA Audit Vault on Solana Devnet.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased selection:bg-sentinel-green/30 selection:text-sentinel-green">
        <SolanaWalletProvider>{children}</SolanaWalletProvider>
      </body>
    </html>
  );
}
