#!/usr/bin/env node

const { spawn } = require("node:child_process");

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: node scripts/next-local.js <next-command> [...args]");
  process.exit(2);
}

const env = { ...process.env };

if (process.platform === "darwin" && env.NEXT_NATIVE_SWC_ALLOWED !== "1") {
  env.NEXT_TEST_WASM = "1";
}

const nextBin = require.resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, ...args], {
  cwd: process.cwd(),
  env,
  stdio: ["inherit", "pipe", "pipe"],
});

function forwardFiltered(stream, target) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (line.includes("experimental.useWasmBinary is not an option")) {
        continue;
      }
      target.write(`${line}\n`);
    }
  });
  stream.on("end", () => {
    if (buffer && !buffer.includes("experimental.useWasmBinary is not an option")) {
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
