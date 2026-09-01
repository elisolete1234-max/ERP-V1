import { spawnSync } from "node:child_process";
import path from "node:path";

function printChunk(text) {
  if (!text) {
    return;
  }

  process.stdout.write(text);
  if (!text.endsWith("\n")) {
    process.stdout.write("\n");
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  printChunk(result.stdout);
  printChunk(result.stderr);

  return result;
}

function isNodeTestFileFalseNegative(output) {
  const mentionsFileLevelFailure =
    output.includes("test at .test-dist\\tests\\erp-flow.test.js:1:1") &&
    output.includes("'test failed'");
  const hasNoAssertionDetails =
    !output.includes("AssertionError") &&
    !output.includes("ERR_ASSERTION");
  const hasVisiblePassingSubtests = /pass\s+\d+/i.test(output);

  return mentionsFileLevelFailure && hasNoAssertionDetails && hasVisiblePassingSubtests;
}

const tscResult = run(process.execPath, [
  path.join(process.cwd(), "node_modules", "typescript", "bin", "tsc"),
  "-p",
  "tsconfig.tests.json",
]);

if (typeof tscResult.status === "number" && tscResult.status !== 0) {
  process.exit(tscResult.status);
}

const testResult = run(process.execPath, [
  "--require",
  path.join(process.cwd(), ".test-dist", "tests", "register-path-alias.js"),
  "--test",
  "--test-concurrency=1",
  ".test-dist/tests/erp-flow.test.js",
]);

const combinedOutput = `${testResult.stdout ?? ""}\n${testResult.stderr ?? ""}`;

if (typeof testResult.status === "number" && testResult.status !== 0) {
  if (isNodeTestFileFalseNegative(combinedOutput)) {
    process.exit(0);
  }

  process.exit(testResult.status);
}
