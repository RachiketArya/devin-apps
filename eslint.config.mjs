import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "prisma/generated/**",
      "out/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // The security boundary: tool code must never touch the database directly.
    // Tools may only receive a transaction handle through the platform wrappers
    // (src/platform/tx.ts), which run authorize() first and write the audit
    // event in the same transaction.
    files: ["src/apps/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": "off",
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@prisma/client",
              message:
                "Tool code must not import the database client. Use the platform wrappers in src/platform/tx.ts.",
            },
          ],
          patterns: [
            {
              group: ["**/platform/db", "**/platform/db.*", "**/generated/**"],
              message:
                "Tool code must not import the database client. Use the platform wrappers in src/platform/tx.ts.",
              // `import type { Tx }` is erased at compile time and is safe.
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
