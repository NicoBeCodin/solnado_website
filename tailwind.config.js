module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
    "./src/***/*.{js, ts, jsx, tsx}"

  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "neon-green": "#39FF14",
        "neon-yellow": "#F9FF33",
        "neon-yellow": "#F9FF33",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};