import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#0f1720",
        surface: "#16202a",
        accent: "#12c48b",
        accentSoft: "#58d6ac",
        danger: "#ff5d5d",
      },
      boxShadow: {
        panel: "0 18px 42px rgba(0, 0, 0, 0.28)",
      },
    },
  },
  plugins: [],
} satisfies Config;
