import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

function collectMarkdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectMarkdownFiles(filePath);
    return entry.isFile() && entry.name.endsWith(".md") ? [filePath] : [];
  });
}

const files = ["README.md", ...collectMarkdownFiles("docs")];
const missing = [];

for (const file of files) {
  const markdown = readFileSync(file, "utf8");
  for (const match of markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const href = match[1];
    if (/^(?:https?:|mailto:|#)/.test(href)) continue;

    const target = href.split("#", 1)[0];
    const resolved = path.resolve(path.dirname(file), target);
    if (!existsSync(resolved)) missing.push(`${file}: ${href}`);
  }
}

if (missing.length > 0) {
  console.error(`发现 ${missing.length} 个无效的本地文档链接：`);
  for (const item of missing) console.error(`- ${item}`);
  process.exit(1);
}

console.log(`文档链接检查通过：${files.length} 个 Markdown 文件。`);
