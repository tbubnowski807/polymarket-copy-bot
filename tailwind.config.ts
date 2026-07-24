import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Max HQ dark palette
        base: {
          900: "#0a0b0f",
          800: "#111318",
          700: "#181b22",
          600: "#20242e",
          500: "#2b303c",
        },
        edge: "#2a2f3a",
        ink: {
          100: "#f4f6fb",
          300: "#c3c9d6",
          500: "#8b93a7",
          700: "#5b6273",
        },
        pos: "#39d98a",
        neg: "#f6465d",
        warn: "#f0b429",
        accent: "#5b8cff",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
