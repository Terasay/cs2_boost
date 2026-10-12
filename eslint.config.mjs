import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    ".npm-cache/**",
    ".wrangler/**",
    "outputs/**",
    "work/**",
    "next-env.d.ts",
  ]),
  {
    files: ["app/**/*.{ts,tsx}"],
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      "@next/next/no-location-assign-relative-destination": "off",
    },
  },
]);

export default eslintConfig;
