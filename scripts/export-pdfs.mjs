#!/usr/bin/env node

import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

let marked;
let chromium;

try {
  ({ marked } = await import("marked"));
} catch {
  console.error("[export-pdfs] 未检测到 marked 依赖，请执行 `npm install marked` 后重试。");
  process.exit(1);
}

try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error(
    "[export-pdfs] 未检测到 Playwright，请执行 `npx playwright install chromium` 后重试。"
  );
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, "docs", "output");

const documents = [
  {
    source: path.join(rootDir, "README.md"),
    displayName: "README",
    output: path.join(outputDir, "README.pdf"),
    title: "AI 旅行规划师 README",
  },
  {
    source: path.join(rootDir, "docs", "AI旅行规划师项目实现指南.md"),
    displayName: "项目实现指南",
    output: path.join(outputDir, "AI旅行规划师项目实现指南.pdf"),
    title: "AI 旅行规划师项目实现指南",
  },
];

const baseStyles = `
  @page {
    margin: 25mm 20mm;
  }
  body {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: #1f2933;
    font-size: 14px;
    line-height: 1.6;
    padding: 0 8px 40px;
  }
  h1, h2, h3, h4, h5, h6 {
    color: #0b7285;
    font-weight: 600;
    margin-top: 28px;
  }
  h1 { font-size: 28px; border-bottom: 2px solid #e1e8ed; padding-bottom: 12px; }
  h2 { font-size: 22px; border-left: 4px solid #0b7285; padding-left: 10px; }
  h3 { font-size: 18px; }
  h4 { font-size: 16px; }
  p { margin: 12px 0; }
  ul, ol { margin: 10px 0 10px 24px; }
  blockquote {
    background: #f1f5f9;
    padding: 12px 16px;
    border-left: 4px solid #0b7285;
    color: #475569;
    margin: 16px 0;
    border-radius: 8px;
  }
  code {
    font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    padding: 2px 4px;
    border-radius: 4px;
    font-size: 13px;
  }
  pre {
    background: #0f172a;
    color: #e2e8f0;
    padding: 16px;
    border-radius: 10px;
    overflow-x: auto;
    font-size: 13px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 18px 0;
    font-size: 13px;
  }
  th, td {
    border: 1px solid #dce3ec;
    padding: 8px 10px;
    text-align: left;
  }
  th {
    background-color: #f0f4f8;
    font-weight: 600;
  }
  a {
    color: #0b7285;
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }
  hr {
    border: none;
    border-top: 1px solid #e2e8f0;
    margin: 24px 0;
  }
`;

function wrapHtml({ title, content }) {
  return `<!DOCTYPE html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <title>${title}</title>
      <style>${baseStyles}</style>
    </head>
    <body>
      ${content}
    </body>
  </html>`;
}

async function convertMarkdownToPdf(browser, doc) {
  const markdown = await readFile(doc.source, "utf-8");
  const htmlContent = marked.parse(markdown, { gfm: true });
  const html = wrapHtml({ title: doc.title, content: htmlContent });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.pdf({
    path: doc.output,
    format: "A4",
    printBackground: true,
  });
  await page.close();
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    for (const doc of documents) {
      console.log(`[export-pdfs] 正在生成 ${doc.displayName} PDF...`);
      await convertMarkdownToPdf(browser, doc);
    }
  } finally {
    await browser.close();
  }

  console.log(`[export-pdfs] 所有 PDF 已生成至 ${path.relative(rootDir, outputDir)}`);
}

main().catch((error) => {
  console.error("[export-pdfs] 生成 PDF 过程中出现错误：");
  console.error(error);
  if (error?.message?.includes("bootstrap_check_in")) {
    console.error(
      "[export-pdfs] 检测到浏览器启动权限受限，可在 Codex CLI 中使用 `with_escalated_permissions` 重新运行。"
    );
  }
  process.exit(1);
});
