import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Palette LEGDAY exposée à Tailwind pour composer sans quitter le token system.
        ink: {
          0: "#100E0D",
          1: "#1a1817",
          2: "#24211f",
          3: "#2a2724",
          4: "#332f2b",
        },
        text: {
          1: "#f5f7fc",
          2: "#a8afd0",
          3: "#6b7396",
        },
        signature: "#8ea9ff",
        positive: "#5FB03E",
        warm: "#E85820",
        gold: "#e6b34e",
        danger: "#ef5a67",
        platinum: "#DCDAD0",
        navy: {
          DEFAULT: "#252B5B",
          deep: "#171b3d",
          soft: "#3a4278",
        },
      },
      fontFamily: {
        sans: ["var(--f-sans)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--f-mono)", "'JetBrains Mono'", "monospace"],
      },
      borderRadius: {
        // LEGDAY strict : 14 · 20 · 32 · 999
        "legday-sm": "14px",
        "legday-md": "20px",
        "legday-lg": "32px",
        "legday-pill": "999px",
      },
      spacing: {
        // LEGDAY strict : 4 · 8 · 12 · 16 · 20 · 24 · 32
      },
      keyframes: {
        slideInLeft: {
          from: { opacity: "0", transform: "translateX(-8px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      animation: {
        slideInLeft: "slideInLeft 220ms cubic-bezier(0.16, 1, 0.3, 1)",
        fadeIn: "fadeIn 180ms ease-out",
      },
    },
  },
  plugins: [],
}
export default config
