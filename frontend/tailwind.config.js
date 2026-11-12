/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Plus Jakarta Sans", "Inter", "system-ui", "sans-serif"] },
      colors: {
        brand: { DEFAULT: "#1E6B45", dark: "#0E2E1F", soft: "#EAF5EE" },
        lime: { DEFAULT: "#C4F042", soft: "#F3FBDD", deep: "#9CCB1E" },
        pine: { DEFAULT: "#2F6B4F", soft: "#E6F2EC" },
        ink: { DEFAULT: "#111814", muted: "#6B756F" },
        canvas: "#F1F3F1",
      },
      boxShadow: { card: "0 1px 2px rgba(15,23,42,.04), 0 1px 12px rgba(15,23,42,.04)" },
      borderRadius: { xl2: "1.25rem" },
    },
  },
  plugins: [],
};
