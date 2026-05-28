#!/usr/bin/env node
// PreToolUse hook: block Edit/Write on .env* files so secrets never leak via
// an automated tool call. The user can still edit them manually outside Claude.
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  try {
    const ev = JSON.parse(input);
    const fp = ev?.tool_input?.file_path ?? "";
    // Matches .env, .env.local, .env.example, .env.production, etc.
    if (/(^|[\\/])\.env(\.[^\\/]+)?$/.test(fp)) {
      process.stderr.write(
        `Edit to ${fp} blocked — .env files hold secrets. Edit them manually outside Claude.\n`,
      );
      process.exit(2); // PreToolUse: exit 2 + stderr blocks the tool call.
    }
  } catch {
    // If we can't parse the event, don't block — fail open.
  }
  process.exit(0);
});
