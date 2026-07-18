import { access, copyFile, mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractReferences, resolveLocalReference } from "./local-references.mjs";
import { checkStyles } from "./styles.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(projectRoot, "dist");
const entryFiles = [
  "index.html",
  "404.html",
  "robots.txt",
  "sitemap.xml",
  "assets/fonts/LICENSE.txt",
  "assets/icons/LICENSE.txt"
];
const generatedStylesheet = "assets/css/style.css";

function sourcePath(relativePath) {
  return path.join(projectRoot, ...relativePath.split("/"));
}

function outputPath(relativePath) {
  return path.join(outputRoot, ...relativePath.split("/"));
}

async function copy(relativePath, explicitSource = sourcePath(relativePath)) {
  const destination = outputPath(relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(explicitSource, destination);
}

async function existsAsFile(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

await checkStyles();
await rm(outputRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
await mkdir(outputRoot, { recursive: true });

for (const entry of entryFiles) {
  await access(sourcePath(entry));
  await copy(entry);
}

// The committed root stylesheet is the zero-build Live Server artifact. Copy it
// byte-for-byte so the source preview and deployment cannot silently diverge.
await copy(generatedStylesheet);

const queue = [...entryFiles, generatedStylesheet];
const processed = new Set();
const missing = [];

while (queue.length > 0) {
  const relativePath = queue.shift();
  if (processed.has(relativePath)) continue;
  processed.add(relativePath);

  const destination = outputPath(relativePath);
  if (!(await existsAsFile(destination))) {
    const source = sourcePath(relativePath);
    if (!(await existsAsFile(source))) {
      missing.push(relativePath);
      continue;
    }
    await copy(relativePath, source);
  }

  const extension = path.posix.extname(relativePath).toLowerCase();
  if (![".css", ".htm", ".html", ".js", ".mjs"].includes(extension)) continue;

  const contents = await readFile(destination, "utf8");
  for (const reference of extractReferences(contents, relativePath)) {
    const resolved = resolveLocalReference(reference, relativePath);
    if (!resolved) continue;
    if (resolved.error) {
      missing.push(`${relativePath}: ${resolved.error}`);
      continue;
    }
    queue.push(resolved.relativePath);
  }
}

if (missing.length > 0) {
  throw new Error(`Build stopped because local references are missing:\n- ${[...new Set(missing)].join("\n- ")}`);
}

console.log(`Built ${processed.size} production files in dist/.`);
