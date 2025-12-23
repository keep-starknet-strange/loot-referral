import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Loot Survivor color palette
        'dungeon': {
          'dark': '#0a1a0f',      // Very dark green background
          'green': '#1a3a2a',     // Dark green panels
          'green-light': '#2d5a3d', // Lighter green for borders
          'green-glow': '#10b981',   // Green glow/accents
          'yellow': '#fbbf24',    // Yellow buttons
          'yellow-dark': '#f59e0b', // Darker yellow for hover
          'text': '#d0c98d',      // Text color for titles and headings
          'button': '#d7c529',    // Connect wallet button color
          'border': '#374227',    // Border color
        },
      },
      fontFamily: {
        'game': ['Transcend Bold', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;

