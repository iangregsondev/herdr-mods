import { afterEach, assert, describe, it, vi } from "@effect/vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { runHerdr } from "./herdr.ts";
import { fakeBin, fakeHerdrHost, loggedLines, tempDir, writeFile } from "./test-support.ts";

describe("runHerdr, remote target", () => {
  it.effect("runs herdr-app on the Herdr host and gives its output", () => {
    const fake = fakeHerdrHost();
    fakeBin(fake.appBin, "herdr-app", `echo "host app: $*"`);
    return Effect.gen(function* () {
      const result = yield* runHerdr(["status"], { env: { HERDR_DEV_CONFIG: fake.config } });
      assert.deepStrictEqual(result, { code: 0, stdout: "host app: status\n", stderr: "" });
    });
  });
});

describe("runHerdr, herdr-app fails", () => {
  it.effect("passes on herdr-app's exit code and output", () => {
    const fake = fakeHerdrHost();
    fakeBin(fake.appBin, "herdr-app", "echo partial; echo 'not running' >&2; exit 3");
    return Effect.gen(function* () {
      const result = yield* runHerdr(["status"], { env: { HERDR_DEV_CONFIG: fake.config } });
      assert.deepStrictEqual(result, { code: 3, stdout: "partial\n", stderr: "not running\n" });
    });
  });
});

describe("runHerdr, unreachable host", () => {
  it.effect("exits 1 saying the Herdr host is unreachable", () => {
    const fake = fakeHerdrHost({ unreachable: true });
    return Effect.gen(function* () {
      const result = yield* runHerdr(["status"], { env: { HERDR_DEV_CONFIG: fake.config } });
      assert.deepStrictEqual(result, {
        code: 1,
        stdout: "",
        stderr:
          "herdr: Herdr host unreachable: ann@herdr-host:2222 " +
          "(ssh: connect to host herdr-host port 2222: Connection refused)\n",
      });
    });
  });
});

describe("runHerdr, no dev config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.effect("runs herdr-app from PATH on this machine", () => {
    const bin = join(tempDir(), "bin");
    vi.stubEnv("PATH", `${bin}:${process.env.PATH ?? ""}`);
    fakeBin(bin, "herdr-app", `echo "local app: $*"`);
    const repoRoot = tempDir();
    return Effect.gen(function* () {
      const result = yield* runHerdr(["status"], { env: {}, repoRoot });
      assert.deepStrictEqual(result, { code: 0, stdout: "local app: status\n", stderr: "" });
    });
  });

  it.effect("exits 127 naming the failure when herdr-app can't start", () => {
    vi.stubEnv("PATH", join(tempDir(), "empty-bin"));
    const repoRoot = tempDir();
    return Effect.gen(function* () {
      const result = yield* runHerdr(["status"], { env: {}, repoRoot });
      assert.deepStrictEqual(result, {
        code: 127,
        stdout: "",
        stderr: "herdr: couldn't run herdr-app status (spawnSync herdr-app ENOENT)\n",
      });
    });
  });
});

describe("runHerdr, bad dev config", () => {
  it.effect("exits 1 naming the file and the field, and runs nothing", () => {
    const fake = fakeHerdrHost();
    const config = writeFile(
      tempDir(),
      "herdr-dev.json",
      '{ "target": "remote", "remote": { "user": "ann" } }',
    );
    return Effect.gen(function* () {
      const result = yield* runHerdr(["status"], { env: { HERDR_DEV_CONFIG: config } });
      assert.deepStrictEqual(result, {
        code: 1,
        stdout: "",
        stderr: `herdr: ${config}: remote.host: Missing key\n`,
      });
      assert.deepStrictEqual(loggedLines(fake.sshLog), []);
    });
  });

  it.effect("exits 1 naming a config file that can't be read", () => {
    const config = join(tempDir(), "missing.json");
    return Effect.gen(function* () {
      const result = yield* runHerdr(["status"], { env: { HERDR_DEV_CONFIG: config } });
      assert.deepStrictEqual(result, {
        code: 1,
        stdout: "",
        stderr: `herdr: couldn't read ${config} (ENOENT: no such file or directory, open '${config}')\n`,
      });
    });
  });
});

describe("herdr CLI", () => {
  it("prints herdr-app's output from the Herdr host and exits with its exit code", () => {
    const fake = fakeHerdrHost();
    fakeBin(fake.appBin, "herdr-app", `echo "host app: $*"; echo warn >&2; exit 4`);
    const result = spawnSync("vpx", ["scripts/herdr.ts", "status", "--json"], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: { ...process.env, HERDR_DEV_CONFIG: fake.config },
      encoding: "utf8",
    });
    assert.deepStrictEqual(
      { code: result.status, stdout: result.stdout, stderr: result.stderr },
      { code: 4, stdout: "host app: status --json\n", stderr: "warn\n" },
    );
  });
});
