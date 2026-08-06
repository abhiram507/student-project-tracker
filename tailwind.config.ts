import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#0f1720", soft: "#42505e", faint: "#8b98a5" },
        surface: { DEFAULT: "#ffffff", sunk: "#f5f7f9", line: "#e3e8ed" },
        accent: { DEFAULT: "#1f6feb", soft: "#e8f1fe" },
        good: "#137a4a",
        warn: "#9a6700",
        bad: "#b3261e",
      },
      fontFamily: { sans: ["var(--font-sans)", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
} satisfies Config;
