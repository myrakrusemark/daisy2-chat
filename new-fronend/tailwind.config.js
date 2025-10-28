const plugin = require("tailwindcss/plugin");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,js,njk}"],
  theme: {
    extend: {
      // Reference CSS custom properties from input.css
      backdropBlur: {
        glass: "var(--blur-glass)",
      },
      transitionDuration: {
        state: "var(--transition-state)",
        interaction: "var(--transition-interaction)",
      },
    },
  },
  plugins: [
    require("daisyui"),

    // Glassmorphism utility plugin
    plugin(function ({ addUtilities }) {
      const glassUtilities = {
        // Base glass effects with backdrop blur
        ".glass-blur": {
          backdropFilter: "blur(var(--blur-glass))",
        },

        // Light translucent glass - for secondary elements
        ".glass-light": {
          background: "rgba(255, 255, 255, var(--glass-opacity-light))",
          backdropFilter: "blur(var(--blur-glass))",
          border: "var(--border-glass-light) solid rgba(255, 255, 255, var(--border-opacity-light))",
        },

        // Medium translucent glass - for primary elements
        ".glass-medium": {
          background: "rgba(255, 255, 255, var(--glass-opacity-medium))",
          backdropFilter: "blur(var(--blur-glass))",
          border: "var(--border-glass-light) solid rgba(255, 255, 255, var(--border-opacity-medium))",
        },

        // Strong translucent glass - for hover states
        ".glass-strong": {
          background: "rgba(255, 255, 255, var(--glass-opacity-strong))",
          backdropFilter: "blur(var(--blur-glass))",
          border: "var(--border-glass-light) solid rgba(255, 255, 255, var(--border-opacity-strong))",
        },

        // Stronger glass - for active states
        ".glass-stronger": {
          background: "rgba(255, 255, 255, var(--glass-opacity-stronger))",
          backdropFilter: "blur(var(--blur-glass))",
          border: "var(--border-glass-medium) solid rgba(255, 255, 255, var(--border-opacity-stronger))",
        },

        // Dark glass - for overlays/sidebars
        ".glass-dark": {
          background: "rgba(15, 23, 42, var(--glass-opacity-dark))",
          backdropFilter: "blur(var(--blur-glass))",
        },

        // Component-specific glass utilities
        ".glass-card": {
          background: "rgba(255, 255, 255, var(--glass-opacity-medium))",
          backdropFilter: "blur(var(--blur-glass))",
          border: "var(--border-glass-light) solid rgba(255, 255, 255, var(--border-opacity-medium))",
          borderRadius: "1rem",
        },

        ".glass-button": {
          background: "rgba(255, 255, 255, var(--glass-opacity-medium))",
          backdropFilter: "blur(var(--blur-glass))",
          border: "var(--border-glass-medium) solid rgba(255, 255, 255, var(--border-opacity-strong))",
          transition: "all var(--transition-interaction)",
        },

        ".glass-button:hover": {
          background: "rgba(255, 255, 255, var(--glass-opacity-strong))",
          borderColor: "rgba(255, 255, 255, var(--border-opacity-stronger))",
        },

        ".glass-button:active": {
          background: "rgba(255, 255, 255, var(--glass-opacity-stronger))",
          borderColor: "rgba(255, 255, 255, var(--border-opacity-strongest))",
        },

        ".glass-tool-display": {
          background: "rgba(255, 255, 255, 0.1)",
          backdropFilter: "blur(var(--blur-glass))",
          borderRadius: "1rem",
        },
      };

      addUtilities(glassUtilities);
    }),
  ],
  daisyui: {
    themes: [
      {
        dark: {
          ...require("daisyui/src/theming/themes")["dark"],
          "primary": "#3b82f6",        // Bright blue
          "primary-content": "#ffffff",
          "secondary": "#1e40af",      // Deep blue
          "accent": "#60a5fa",         // Light blue
          "base-100": "#0f172a",       // Very dark blue-gray (slate-900)
          "base-200": "#1e293b",       // Dark blue-gray (slate-800)
          "base-300": "#334155",       // Medium blue-gray (slate-700)
          "base-content": "#e2e8f0",   // Light text
        },
      },
      "business",
    ],
    darkTheme: "dark",
    base: true,
    styled: true,
    utils: true,
  },
}
