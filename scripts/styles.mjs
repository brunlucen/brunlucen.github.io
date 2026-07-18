import { watch } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as sass from "sass";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stylesDirectory = path.join(projectRoot, "assets", "css");
const stylesheetSource = path.join(stylesDirectory, "style.scss");
export const generatedStylesheet = path.join(stylesDirectory, "style.css");
const banner = "/*! Generated from assets/css/style.scss — do not edit directly. */";

export function compileStyles() {
  const compiled = sass.compile(stylesheetSource, {
    loadPaths: [stylesDirectory],
    sourceMap: false,
    style: "compressed"
  });
  return `${banner}\n${compiled.css}\n`;
}

export async function writeStyles() {
  const css = compileStyles();
  await mkdir(path.dirname(generatedStylesheet), { recursive: true });
  await writeFile(generatedStylesheet, css, "utf8");
  return css;
}

export async function checkStyles() {
  const expected = compileStyles();
  let actual = "";
  try {
    actual = await readFile(generatedStylesheet, "utf8");
  } catch {
    throw new Error("assets/css/style.css is missing. Run `npm run styles:build`.");
  }

  if (actual !== expected) {
    throw new Error("assets/css/style.css does not match the SCSS source. Run `npm run styles:build` and commit the result.");
  }
  return expected;
}

async function run() {
  const mode = process.argv[2] ?? "--write";

  if (mode === "--check") {
    await checkStyles();
    console.log("Generated CSS matches the SCSS source.");
    return;
  }

  if (mode === "--write") {
    await writeStyles();
    console.log("Generated assets/css/style.css from SCSS.");
    return;
  }

  if (mode !== "--watch") {
    throw new Error(`Unknown styles mode: ${mode}`);
  }

  await writeStyles();
  console.log("Watching assets/css/*.scss and keeping assets/css/style.css current.");
  let timer;
  const watcher = watch(stylesDirectory, (_eventType, filename) => {
    if (!filename?.endsWith(".scss")) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        await writeStyles();
        console.log(`Regenerated CSS after ${filename} changed.`);
      } catch (error) {
        console.error(error instanceof Error ? error.message : error);
      }
    }, 75);
  });

  const close = () => {
    clearTimeout(timer);
    watcher.close();
    process.exit(0);
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
