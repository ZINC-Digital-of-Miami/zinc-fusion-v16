#!/usr/bin/env node

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: node scripts/next-local.js <next-command> [...args]");
  process.exit(2);
}

const env = { ...process.env };
if (!env.NEXT_LOCAL_DIST_DIR) {
  env.NEXT_LOCAL_DIST_DIR = args[0] === "build"
    ? `.next-local/build-${process.pid}-${Date.now()}`
    : ".next-local/dev";
}
if (!env.NEXT_LOCAL_TSCONFIG) {
  const localTsconfig = path.join(".next-local", "tsconfig.next-local.json");
  const localTsconfigContents = {
    extends: "../tsconfig.json",
    compilerOptions: {
      paths: {
        "@/*": ["../*"],
      },
    },
  };
  fs.mkdirSync(path.dirname(localTsconfig), { recursive: true });
  fs.writeFileSync(
    localTsconfig,
    `${JSON.stringify(localTsconfigContents, null, 2)}\n`,
  );
  env.NEXT_LOCAL_TSCONFIG = localTsconfig;
}

if (process.platform === "darwin" && env.NEXT_NATIVE_SWC_ALLOWED !== "1") {
  env.NEXT_TEST_WASM = "1";
}

const nextBin = require.resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, ...args], {
  cwd: process.cwd(),
  env,
  stdio: ["inherit", "pipe", "pipe"],
});

const filteredWarnings = [
  "experimental.useWasmBinary is not an option",
  'The "middleware" file convention is deprecated',
  "https://nextjs.org/docs/messages/middleware-to-proxy",
  "Serializing big strings",
];

function shouldFilter(line) {
  return filteredWarnings.some((warning) => line.includes(warning));
}

function forwardFiltered(stream, target) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (shouldFilter(line)) {
        continue;
      }
      target.write(`${line}\n`);
    }
  });
  stream.on("end", () => {
    if (buffer && !shouldFilter(buffer)) {
      target.write(buffer);
    }
  });
}

forwardFiltered(child.stdout, process.stdout);
forwardFiltered(child.stderr, process.stderr);

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`next exited with signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
