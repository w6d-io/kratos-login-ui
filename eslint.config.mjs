import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

// Flat config (ESLint 9 / Next 16). Next 16 removed `next lint`, so we run
// `eslint` directly. eslint-config-next@16 ships native flat configs — spread
// them. Mirrors the previous .eslintrc.json (core-web-vitals + two overrides).
export default [
  { ignores: [".next/**", "node_modules/**", "coverage/**"] },
  ...nextCoreWebVitals,
  {
    rules: {
      "react/no-unescaped-entities": "off",
      "@next/next/no-img-element": "off",
      // Retrofit baseline: the eslint-9 / newer eslint-config-next upgrade added
      // this rule (the old eslint-8 core-web-vitals didn't have it). Keep it a
      // warning to preserve prior lint behavior; fix the 4 existing sites later.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];
