import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractHtmlIds, extractReferences, resolveLocalReference } from "./local-references.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteRoot = path.join(projectRoot, "dist");
const queue = ["index.html", "404.html"];
const checked = new Set();
const failures = [];

function diskPath(relativePath) {
  return path.join(siteRoot, ...relativePath.split("/"));
}

async function fileExists(relativePath) {
  try {
    return (await stat(diskPath(relativePath))).isFile();
  } catch {
    return false;
  }
}

while (queue.length > 0) {
  const relativePath = queue.shift();
  if (checked.has(relativePath)) continue;
  checked.add(relativePath);

  if (!(await fileExists(relativePath))) {
    failures.push(`${relativePath} does not exist`);
    continue;
  }

  const extension = path.posix.extname(relativePath).toLowerCase();
  if (![".css", ".htm", ".html", ".js", ".mjs"].includes(extension)) continue;

  const contents = await readFile(diskPath(relativePath), "utf8");
  for (const reference of extractReferences(contents, relativePath)) {
    const resolved = resolveLocalReference(reference, relativePath);
    if (!resolved) {
      if (reference.startsWith("#") && extension === ".html") {
        const fragment = reference.slice(1);
        if (fragment && !extractHtmlIds(contents).has(fragment)) {
          failures.push(`${relativePath} links to missing fragment #${fragment}`);
        }
      }
      continue;
    }
    if (resolved.error) {
      failures.push(`${relativePath} ${resolved.error}`);
      continue;
    }
    if (!(await fileExists(resolved.relativePath))) {
      failures.push(`${relativePath} references missing ${resolved.relativePath}`);
      continue;
    }

    if (resolved.fragment && /\.html?$/i.test(resolved.relativePath)) {
      const targetContents = await readFile(diskPath(resolved.relativePath), "utf8");
      if (!extractHtmlIds(targetContents).has(resolved.fragment)) {
        failures.push(`${relativePath} links to missing ${resolved.relativePath}#${resolved.fragment}`);
      }
    }
    queue.push(resolved.relativePath);
  }
}

if (failures.length > 0) {
  console.error(`Local reference check failed:\n- ${[...new Set(failures)].join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(`Checked ${checked.size} local files; all references resolve.`);
}
