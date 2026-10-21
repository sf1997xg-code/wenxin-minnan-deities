import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";


const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const skippedDirectories = new Set([
  ".git",
  "node_modules",
  ".gradle",
  ".codex-autonomy",
  "build",
  "data",
  "dist",
  "logs",
  "test-artifacts",
  "coverage"
]);
const textExtensions = new Set([
  ".cjs",
  ".css",
  ".env",
  ".example",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ps1",
  ".toml",
  ".txt",
  ".xml"
]);
const rules = [
  {
    id: "private-key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/
  },
  {
    id: "deepseek-token",
    pattern: /\bsk-[A-Za-z0-9_-]{24,}\b/
  },
  {
    id: "hardcoded-bearer",
    pattern: /Authorization\s*:\s*["']Bearer\s+(?!\$\{)[A-Za-z0-9._-]{20,}["']/i
  },
  {
    id: "env-api-key",
    pattern: /DEEPSEEK_API_KEY\s*=\s*["']?[A-Za-z0-9._-]{24,}/
  },
  {
    id: "github-token",
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/
  },
  {
    id: "private-network-address",
    pattern: /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/
  },
  {
    id: "windows-user-path",
    pattern: /[A-Za-z]:\\Users\\[^\\\s]+/
  },
  {
    id: "personal-email",
    pattern: /\b[A-Za-z0-9._%+-]+@(?!users\.noreply\.github\.com\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/
  }
];


async function textFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && skippedDirectories.has(entry.name)) {
      continue;
    }
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await textFiles(absolute)));
    } else if (
      textExtensions.has(path.extname(entry.name).toLowerCase()) ||
      entry.name.startsWith(".env")
    ) {
      files.push(absolute);
    }
  }
  return files;
}


const findings = [];
const files = await textFiles(projectRoot);
for (const file of files) {
  const content = await readFile(file, "utf8");
  const lines = content.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    for (const rule of rules) {
      if (rule.pattern.test(line)) {
        findings.push({
          file: path.relative(projectRoot, file),
          line: index + 1,
          rule: rule.id
        });
      }
    }
  }
}

if (findings.length > 0) {
  console.error(`SECRET_SCAN_FAILED findings=${findings.length}`);
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line} ${finding.rule}`);
  }
  process.exitCode = 1;
} else {
  console.log(`SECRET_SCAN_OK files=${files.length} rules=${rules.length}`);
}

