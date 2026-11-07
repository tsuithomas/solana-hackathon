import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        sentinel: {
          bg: "#0B0F17",
          panel: "#101624",
          card: "#141C2E",
          border: "#1F2B45",
          green: "#14F195",
          purple: "#9945FF",
          danger: "#FF3B69",
          warning: "#FFB020",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        "glow-green": "0 0 24px -4px rgba(20, 241, 149, 0.28)",
        "glow-purple": "0 0 24px -4px rgba(153, 69, 255, 0.32)",
        "glow-danger": "0 0 28px -4px rgba(255, 59, 105, 0.36)",
      },
    },
  },
  plugins: [],
};

export default config;
