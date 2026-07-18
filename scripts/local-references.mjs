import path from "node:path";

const EXTERNAL_SCHEMES = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;
const SITE_ORIGIN = "https://brunlucen.github.io";

function unquote(value) {
  const trimmed = value.trim();
  const first = trimmed[0];
  const last = trimmed.at(-1);
  if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function htmlAttributes(tag) {
  const attributes = new Map();
  const attributePattern = /([:\w-]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g;
  attributePattern.lastIndex = tag.indexOf(" ");
  for (const match of tag.matchAll(attributePattern)) {
    attributes.set(match[1].toLowerCase(), match[2] ? unquote(match[2]) : "");
  }
  return attributes;
}

function addSrcset(references, srcset) {
  for (const candidate of srcset.split(",")) {
    const reference = candidate.trim().split(/\s+/, 1)[0];
    if (reference) references.add(reference);
  }
}

function htmlReferences(text) {
  const references = new Set();
  const tagPattern = /<(?:a|audio|embed|iframe|image|img|link|meta|object|script|source|use|video)\b[^>]*>/gi;

  for (const match of text.matchAll(tagPattern)) {
    const tag = match[0];
    const attributes = htmlAttributes(tag);

    for (const name of ["href", "src", "poster", "data"]) {
      const value = attributes.get(name);
      if (value) references.add(value);
    }

    if (attributes.has("srcset")) addSrcset(references, attributes.get("srcset"));

    const property = attributes.get("property") ?? attributes.get("name") ?? "";
    if (/^(?:og|twitter):image(?::url)?$/i.test(property) && attributes.has("content")) {
      references.add(attributes.get("content"));
    }
  }

  for (const match of text.matchAll(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    for (const urlMatch of (match[1] ?? match[2]).matchAll(/url\(\s*([^)]+?)\s*\)/gi)) {
      references.add(unquote(urlMatch[1]));
    }
  }

  return references;
}

function cssReferences(text) {
  const references = new Set();
  for (const match of text.matchAll(/url\(\s*([^)]+?)\s*\)/gi)) {
    references.add(unquote(match[1]));
  }
  for (const match of text.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/gi)) {
    references.add(match[1]);
  }
  return references;
}

function javascriptReferences(text) {
  const references = new Set();
  const patterns = [
    /\b(?:import|export)\s+(?:[^"']+?\s+from\s+)?["']([^"']+)["']/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
    /\bnew\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) references.add(match[1]);
  }
  return references;
}

export function extractReferences(text, relativePath) {
  switch (path.posix.extname(relativePath).toLowerCase()) {
    case ".html":
    case ".htm":
      return htmlReferences(text);
    case ".css":
      return cssReferences(text);
    case ".js":
    case ".mjs":
      return javascriptReferences(text);
    default:
      return new Set();
  }
}

export function splitReference(reference) {
  const hashIndex = reference.indexOf("#");
  const queryIndex = reference.indexOf("?");
  const cutAt = [hashIndex, queryIndex].filter((index) => index >= 0).sort((a, b) => a - b)[0];
  return {
    pathname: cutAt === undefined ? reference : reference.slice(0, cutAt),
    fragment: hashIndex >= 0 ? reference.slice(hashIndex + 1).split("?", 1)[0] : ""
  };
}

export function resolveLocalReference(reference, fromRelativePath) {
  let value = reference.trim();
  if (!value || value.startsWith("#")) return null;

  if (EXTERNAL_SCHEMES.test(value)) {
    let absolute;
    try {
      absolute = new URL(value, SITE_ORIGIN);
    } catch {
      return null;
    }
    if (absolute.origin !== SITE_ORIGIN) return null;
    value = `${absolute.pathname}${absolute.search}${absolute.hash}`;
  }

  const { pathname, fragment } = splitReference(value);
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return { error: `contains invalid URL encoding: ${reference}` };
  }

  const normalized = decoded.startsWith("/")
    ? path.posix.normalize(decoded.slice(1))
    : path.posix.normalize(path.posix.join(path.posix.dirname(fromRelativePath), decoded));

  if (!normalized || normalized === ".") {
    return { relativePath: "index.html", fragment };
  }
  if (normalized === ".." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
    return { error: `escapes the site root: ${reference}` };
  }

  return { relativePath: normalized.endsWith("/") ? `${normalized}index.html` : normalized, fragment };
}

export function extractHtmlIds(text) {
  const ids = new Set();
  for (const match of text.matchAll(/\b(?:id|name)\s*=\s*(?:"([^"]+)"|'([^']+)')/gi)) {
    ids.add(match[1] ?? match[2]);
  }
  return ids;
}
