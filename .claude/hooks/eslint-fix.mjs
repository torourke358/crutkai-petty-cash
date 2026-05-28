#!/usr/bin/env node
// PostToolUse hook: after an Edit/Write to a TypeScript file under src/,
// run eslint --fix on just that file. Quiet on success; never blocks.
import { spawnSync } from "node:child_process";

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  let fp = "";
  try {
    fp = JSON.parse(input)?.tool_input?.file_path ?? "";
  } catch {
    process.exit(0);
  }
  if (!/src[\\/].+\.(ts|tsx)$/.test(fp)) process.exit(0);

  // shell: true makes npx → npx.cmd resolution work on Windows.
  spawnSync("npx", ["eslint", "--fix", fp], {
    stdio: ["ignore", "ignore", "inherit"],
    shell: true,
  });
  // Always exit 0 — lint findings shouldn't fail the tool call.
  process.exit(0);
});
