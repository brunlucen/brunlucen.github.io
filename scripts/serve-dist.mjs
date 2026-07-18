import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootMode = process.argv.find((argument) => argument.startsWith("--root="))?.split("=")[1] ?? "dist";
if (!new Set(["dist", "source"]).has(rootMode)) {
  throw new Error(`Unsupported preview root: ${rootMode}`);
}
const root = rootMode === "source" ? projectRoot : path.join(projectRoot, "dist");
const host = "127.0.0.1";
const commandLinePort = process.argv.find((argument) => argument.startsWith("--port="))?.split("=")[1];
const port = Number.parseInt(commandLinePort ?? process.env.PORT ?? "4173", 10);
const contentTypes = new Map([
  [".avif", "image/avif"],
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mp4", "video/mp4"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webm", "video/webm"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
  [".xml", "application/xml; charset=utf-8"]
]);

async function isFile(filePath) {
  try {
    const details = await stat(filePath);
    return details.isFile() ? details : null;
  } catch {
    return null;
  }
}

const server = createServer(async (request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, `http://${host}:${port}`).pathname);
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }

  if (
    process.env.PORTFOLIO_TEST_TOKEN
    && request.method === "POST"
    && pathname === "/__portfolio_test_shutdown__"
    && request.headers["x-portfolio-test-token"] === process.env.PORTFOLIO_TEST_TOKEN
  ) {
    response.writeHead(204).end(() => setImmediate(shutDown));
    return;
  }

  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const candidate = path.resolve(root, relative);
  const safeCandidate = candidate === root || candidate.startsWith(`${root}${path.sep}`);
  let filePath = safeCandidate ? candidate : "";
  let details = filePath ? await isFile(filePath) : null;
  let status = 200;

  if (!details) {
    filePath = path.join(root, "404.html");
    details = await isFile(filePath);
    status = 404;
  }
  if (!details) {
    response.writeHead(500).end("Build output is incomplete");
    return;
  }

  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": contentTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream",
    "X-Content-Type-Options": "nosniff"
  };
  const range = request.headers.range;
  if (range && /^bytes=\d*-\d*$/.test(range)) {
    const [startText, endText] = range.slice(6).split("-");
    const start = startText ? Number(startText) : 0;
    const end = endText ? Math.min(Number(endText), details.size - 1) : details.size - 1;
    if (start <= end && start < details.size) {
      response.writeHead(206, {
        ...headers,
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
        "Content-Range": `bytes ${start}-${end}/${details.size}`
      });
      if (request.method === "HEAD") response.end();
      else createReadStream(filePath, { start, end }).pipe(response);
      return;
    }
  }

  response.writeHead(status, { ...headers, "Content-Length": details.size });
  if (request.method === "HEAD") response.end();
  else createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => console.log(`Serving ${rootMode === "source" ? "source root" : "dist/"} at http://${host}:${port}`));

let isShuttingDown = false;
function shutDown() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  const forceExit = setTimeout(() => process.exit(0), 1_000);
  forceExit.unref();
  server.close(() => {
    clearTimeout(forceExit);
    process.exit(0);
  });
  server.closeIdleConnections?.();
  server.closeAllConnections?.();
}

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, shutDown);
