import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Run from any directory: node scripts/verify-walk-time.mjs
// Compiles the real frontend module with its installed TypeScript compiler.
// Uses only local temporary files and child processes; no services or accounts.
const scriptPath = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptPath), "..");
const sourcePath = join(root, "frontend", "src", "lib", "walk-time.ts");
const require = createRequire(import.meta.url);

if (process.argv[2] === "--worker") {
  runWorker(process.argv[3]);
} else {
  runSuite();
}

function runSuite() {
  const temporaryRoot = realpathSync(tmpdir());
  const temporary = mkdtempSync(join(temporaryRoot, "puppyruby-walk-time-"));
  try {
    const output = join(temporary, "compiled");
    const configPath = join(temporary, "tsconfig.json");
    writeFileSync(configPath, JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        lib: ["ES2022", "ES2022.Intl"],
        types: [],
        strict: true,
        skipLibCheck: true,
        noEmitOnError: true,
        rootDir: dirname(sourcePath),
        outDir: output,
      },
      files: [sourcePath],
    }, null, 2));
    const compiler = join(root, "frontend", "node_modules", "typescript", "bin", "tsc");
    execute([compiler, "--project", configPath], "Compile actual walk-time.ts");
    const compiledPath = join(output, "walk-time.js");
    const results = ["UTC", "America/Los_Angeles", "Asia/Seoul"].map(timeZone => {
      const child = execute([scriptPath, "--worker", compiledPath], `Verify in ${timeZone}`, {
        ...process.env, TZ: timeZone,
      });
      const result = JSON.parse(child.stdout);
      assert.equal(result.timeZone, timeZone, "Worker must run with the requested machine time zone");
      return result;
    });
    for (const result of results.slice(1)) {
      assert.equal(result.signature, results[0].signature,
        `KST results must be identical in ${results[0].timeZone} and ${result.timeZone}`);
    }
    const checks = results.reduce((sum, result) => sum + result.checks, 0) + results.length + results.length - 1;
    console.log(`PASS ${checks} checks: actual frontend/src/lib/walk-time.ts`);
    console.log("KST boundaries: 00:00 / 06:00 / 17:00 / 20:00, including the final millisecond before each change.");
    console.log("Every minute: day 660, sunset 180, night 600. Next boundaries and invalid dates verified.");
    console.log("Identical results under UTC, America/Los_Angeles and Asia/Seoul, including US DST transition dates.");
  } finally {
    // Delete only the fresh directory created above, after verifying its resolved scope.
    const resolvedTemporary = realpathSync(temporary);
    assert.equal(dirname(resolvedTemporary), temporaryRoot, "Temporary cleanup must stay inside the OS temporary directory");
    assert.ok(basename(resolvedTemporary).startsWith("puppyruby-walk-time-"), "Temporary cleanup must retain the test directory prefix");
    rmSync(resolvedTemporary, { recursive: true, force: true });
  }
}

function execute(args, label, env = process.env) {
  const result = spawnSync(process.execPath, args, {
    cwd: root, env, encoding: "utf8", shell: false, timeout: 60_000, windowsHide: true,
  });
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  assert.equal(result.status, 0, `${label} failed:\n${result.stderr || result.stdout}`);
  return result;
}

function runWorker(compiledPath) {
  const { getWalkTime, walkSchedule } = require(compiledPath);
  const digest = createHash("sha256");
  let checks = 0;
  function equal(actual, expected, label) {
    assert.deepEqual(actual, expected, label);
    checks++;
  }
  function check(condition, label) {
    assert.ok(condition, label);
    checks++;
  }
  function record(result) { digest.update(JSON.stringify(result)); }
  function verifyInstant(iso, period, clock, nextISO) {
    const timestamp = Date.parse(iso);
    check(Number.isFinite(timestamp), `${iso}: fixture is a valid instant`);
    const result = getWalkTime(timestamp);
    equal(result.period, period, `${iso}: KST period`);
    equal(result.theme, { day: "meadow", sunset: "sunset", night: "night" }[period], `${iso}: scene theme`);
    equal(result.clock, clock, `${iso}: 24-hour KST clock`);
    const [hour, minute] = clock.split(":").map(Number);
    equal(result.minutes, hour * 60 + minute, `${iso}: minute of KST day`);
    equal(result.nextChangeAt, Date.parse(nextISO), `${iso}: exact next boundary timestamp`);
    check(result.nextChangeAt > timestamp, `${iso}: next boundary must be in the future`);
    equal(getWalkTime(new Date(timestamp)), result, `${iso}: Date and number inputs agree`);
    record(result);
  }

  equal(typeof getWalkTime, "function", "Load the actual exported implementation");
  equal(walkSchedule.map(({ period, theme, hours }) => ({ period, theme, hours })), [
    { period: "day", theme: "meadow", hours: "06:00–17:00" },
    { period: "sunset", theme: "sunset", hours: "17:00–20:00" },
    { period: "night", theme: "night", hours: "20:00–06:00" },
  ], "Published schedule matches scene durations");

  const cases = [
    ["2026-09-12T00:00:00.000+09:00", "night", "00:00", "2026-09-12T06:00:00.000+09:00"],
    ["2026-09-12T05:59:59.999+09:00", "night", "05:59", "2026-09-12T06:00:00.000+09:00"],
    ["2026-09-12T06:00:00.000+09:00", "day", "06:00", "2026-09-12T17:00:00.000+09:00"],
    ["2026-09-12T16:59:00.000+09:00", "day", "16:59", "2026-09-12T17:00:00.000+09:00"],
    ["2026-09-12T16:59:59.999+09:00", "day", "16:59", "2026-09-12T17:00:00.000+09:00"],
    ["2026-09-12T17:00:00.000+09:00", "sunset", "17:00", "2026-09-12T20:00:00.000+09:00"],
    ["2026-09-12T19:59:00.000+09:00", "sunset", "19:59", "2026-09-12T20:00:00.000+09:00"],
    ["2026-09-12T19:59:59.999+09:00", "sunset", "19:59", "2026-09-12T20:00:00.000+09:00"],
    ["2026-09-12T20:00:00.000+09:00", "night", "20:00", "2026-09-13T06:00:00.000+09:00"],
    ["2026-09-12T23:59:00.000+09:00", "night", "23:59", "2026-09-13T06:00:00.000+09:00"],
    ["2026-09-12T23:59:59.999+09:00", "night", "23:59", "2026-09-13T06:00:00.000+09:00"],
    ["2026-09-13T00:00:00.000+09:00", "night", "00:00", "2026-09-13T06:00:00.000+09:00"],
    ["2026-09-12T11:26:43.271+09:00", "day", "11:26", "2026-09-12T17:00:00.000+09:00"],
    ["2026-09-30T23:59:59.999+09:00", "night", "23:59", "2026-10-01T06:00:00.000+09:00"],
    ["2026-12-31T23:59:59.999+09:00", "night", "23:59", "2027-01-01T06:00:00.000+09:00"],
    ["2024-02-29T20:00:00.000+09:00", "night", "20:00", "2024-03-01T06:00:00.000+09:00"],
    ["2026-03-08T09:59:59.999Z", "sunset", "18:59", "2026-03-08T20:00:00.000+09:00"],
    ["2026-03-08T10:00:00.000Z", "sunset", "19:00", "2026-03-08T20:00:00.000+09:00"],
    ["2026-11-01T08:59:59.999Z", "sunset", "17:59", "2026-11-01T20:00:00.000+09:00"],
    ["2026-11-01T09:00:00.000Z", "sunset", "18:00", "2026-11-01T20:00:00.000+09:00"],
    ["1970-01-01T00:00:00.000Z", "day", "09:00", "1970-01-01T17:00:00.000+09:00"],
  ];
  for (const fixture of cases) verifyInstant(...fixture);

  for (const invalid of [NaN, Infinity, -Infinity, new Date(NaN), new Date("invalid"), 8.64e15 + 1, -(8.64e15 + 1)]) {
    assert.throws(() => getWalkTime(invalid), RangeError, "Reject invalid or out-of-range dates");
    checks++;
  }

  // Also cover dates on which the alternate machine time zone starts/ends DST.
  for (const day of ["2026-09-12", "2026-03-08", "2026-11-01"]) {
    const midnight = Date.parse(`${day}T00:00:00.000+09:00`);
    const boundaries = [360, 1020, 1200, 1800].map(minutes => midnight + minutes * 60_000);
    const duration = { day: 0, sunset: 0, night: 0 };
    for (let minute = 0; minute < 1440; minute++) {
      const timestamp = midnight + minute * 60_000;
      const result = getWalkTime(timestamp);
      const expectedNext = boundaries.find(boundary => boundary > timestamp);
      const expectedClock = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
      equal(result.clock, expectedClock, `${day}, minute ${minute}: KST clock`);
      equal(result.minutes, minute, `${day}, minute ${minute}: exact minute`);
      equal(result.nextChangeAt, expectedNext, `${day}, minute ${minute}: next boundary`);
      check(Object.hasOwn(duration, result.period), `${day}, minute ${minute}: known period`);
      check(getWalkTime(expectedNext).period !== result.period, `${day}, minute ${minute}: boundary changes the scene`);
      equal(getWalkTime(expectedNext - 1).period, result.period, `${day}, minute ${minute}: scene lasts until the final millisecond`);
      duration[result.period]++;
      record(result);
    }
    equal(duration, { day: 660, sunset: 180, night: 600 }, `${day}: complete 1440-minute schedule`);
    record(duration);
  }

  const timeZone = process.env.TZ;
  const expectedOffsets = {
    UTC: [0, 0],
    "America/Los_Angeles": [480, 420],
    "Asia/Seoul": [-540, -540],
  };
  equal([
    new Date("2026-01-15T12:00:00Z").getTimezoneOffset(),
    new Date("2026-07-15T12:00:00Z").getTimezoneOffset(),
  ], expectedOffsets[timeZone], "Machine TZ override actually applies, including daylight saving time");
  console.log(JSON.stringify({ timeZone, checks, signature: digest.digest("hex") }));
}
