/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#0b0e14",
          800: "#111722",
          700: "#1a2230",
          600: "#243044",
          500: "#33415c",
        },
        accent: "#5b8cff",
        pass: "#3ecf8e",
        fail: "#ff6b6b",
        warn: "#e0a106",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
