import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // 重置默认忽略规则，便于自定义覆盖路径
  globalIgnores([
    // 继承自 eslint-config-next 的默认忽略项
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  eslintPluginPrettierRecommended,
]);

export default eslintConfig;
