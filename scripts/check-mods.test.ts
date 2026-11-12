import { afterEach, assert, describe, it, vi } from "@effect/vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { runCheckMods } from "./check-mods.ts";
import { fakeBin, fakeHerdrHost, loggedLines, tempDir, writeFile } from "./test-support.ts";

/** A repo `mods/` folder holding a built mod for each name. */
const modsFolder = (names: ReadonlyArray<string>): string => {
  const dir = tempDir();
  names.forEach((name) => writeFile(dir, `${name}/main.js`, `// ${name}\n`));
  return dir;
};

/**
 * A fake `herdr-app` on the host whose `check <dir>` passes when `<dir>/main.js` is
 * there, and fails for a mod named in `failing`.
 */
const hostCheck = (appBin: string, failing: ReadonlyArray<string> = []): void =>
  fakeBin(
    appBin,
    "herdr-app",
    [
      'name=$(basename "$2")',
      `case " ${failing.join(" ")} " in *" $name "*) echo "check failed: $name" >&2; exit 1 ;; esac`,
      '[ -f "$2/main.js" ] || { echo "no main.js in $2" >&2; exit 1; }',
      'echo "check passed: $name"',
    ].join("\n"),
  );

describe("runCheckMods, remote target", () => {
  it.effect("checks every mod on the Herdr host and passes when all pass", () => {
    const fake = fakeHerdrHost();
    hostCheck(fake.appBin);
    const mods = modsFolder(["hello", "world"]);
    return Effect.gen(function* () {
      const result = yield* runCheckMods(mods, { env: { HERDR_DEV_CONFIG: fake.config } });
      assert.deepStrictEqual(result, {
        code: 0,
        stdout: "check passed: hello\ncheck passed: world\n",
        stderr: "",
      });
    });
  });

  it.effect("removes its temp folder on the Herdr host after a pass", () => {
    const fake = fakeHerdrHost();
    hostCheck(fake.appBin);
    const mods = modsFolder(["hello"]);
    return Effect.gen(function* () {
      const result = yield* runCheckMods(mods, { env: { HERDR_DEV_CONFIG: fake.config } });
      assert.strictEqual(result.code, 0);
      assert.deepStrictEqual(readdirSync(join(fake.root, "tmp")), []);
    });
  });

  it.effect("exits 1 naming each mod that fails, after checking every mod", () => {
    const fake = fakeHerdrHost();
    hostCheck(fake.appBin, ["bravo", "delta"]);
    const mods = modsFolder(["alpha", "bravo", "charlie", "delta"]);
    return Effect.gen(function* () {
      const result = yield* runCheckMods(mods, { env: { HERDR_DEV_CONFIG: fake.config } });
      assert.deepStrictEqual(result, {
        code: 1,
        stdout: "check passed: alpha\ncheck passed: charlie\n",
        stderr: "check failed: bravo\ncheck failed: delta\n" + "check:mods: failed: bravo, delta\n",
      });
    });
  });

  it.effect("removes its temp folder on the Herdr host after a failed check", () => {
    const fake = fakeHerdrHost();
    hostCheck(fake.appBin, ["hello"]);
    const mods = modsFolder(["hello"]);
    return Effect.gen(function* () {
      const result = yield* runCheckMods(mods, { env: { HERDR_DEV_CONFIG: fake.config } });
      assert.strictEqual(result.code, 1);
      assert.deepStrictEqual(readdirSync(join(fake.root, "tmp")), []);
    });
  });
});

describe("runCheckMods, copy to the host fails", () => {
  it.effect("exits 1 naming the failed copy and removes its temp folder", () => {
    const fake = fakeHerdrHost();
    hostCheck(fake.appBin);
    const mods = modsFolder(["hello"]);
    chmodSync(join(mods, "hello/main.js"), 0o000);
    return Effect.gen(function* () {
      const result = yield* runCheckMods(mods, { env: { HERDR_DEV_CONFIG: fake.config } });
      assert.strictEqual(result.code, 1);
      assert.match(
        result.stderr,
        /^check:mods: couldn't sync .*\(exit 1: .*Permission denied\)\n$/,
      );
      assert.deepStrictEqual(readdirSync(join(fake.root, "tmp")), []);
    });
  });
});

describe("runCheckMods, the host's own mods", () => {
  it.effect("leaves the Herdr host's mods folder as it was", () => {
    const fake = fakeHerdrHost();
    hostCheck(fake.appBin);
    writeFile(fake.home, "mods/hello/main.js", "// installed\n");
    const mods = modsFolder(["hello", "world"]);
    return Effect.gen(function* () {
      const result = yield* runCheckMods(mods, { env: { HERDR_DEV_CONFIG: fake.config } });
      assert.strictEqual(result.code, 0);
      const hostMods = readdirSync(join(fake.home, "mods"), { recursive: true, encoding: "utf8" });
      assert.deepStrictEqual([...hostMods].sort(), ["hello", "hello/main.js"]);
      assert.strictEqual(
        readFileSync(join(fake.home, "mods/hello/main.js"), "utf8"),
        "// installed\n",
      );
    });
  });
});

describe("runCheckMods, unreachable host", () => {
  it.effect("exits 1 saying the Herdr host is unreachable", () => {
    const fake = fakeHerdrHost({ unreachable: true });
    const mods = modsFolder(["hello"]);
    return Effect.gen(function* () {
      const result = yield* runCheckMods(mods, { env: { HERDR_DEV_CONFIG: fake.config } });
      assert.deepStrictEqual(result, {
        code: 1,
        stdout: "",
        stderr:
          "check:mods: Herdr host unreachable: ann@herdr-host:2222 " +
          "(ssh: connect to host herdr-host port 2222: Connection refused)\n",
      });
    });
  });
});

describe("runCheckMods, no dev config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.effect("runs herdr-app check from PATH on each mod folder in place", () => {
    const bin = join(tempDir(), "bin");
    vi.stubEnv("PATH", `${bin}:${process.env.PATH ?? ""}`);
    fakeBin(bin, "herdr-app", 'echo "check passed: $2"');
    const mods = modsFolder(["hello", "world"]);
    return Effect.gen(function* () {
      const result = yield* runCheckMods(mods, { env: {}, repoRoot: tempDir() });
      assert.deepStrictEqual(result, {
        code: 0,
        stdout: `check passed: ${mods}/hello/\ncheck passed: ${mods}/world/\n`,
        stderr: "",
      });
    });
  });
});

describe("runCheckMods, no dev config, no herdr-app", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.effect("exits 1 naming the command that couldn't run", () => {
    vi.stubEnv("PATH", join(tempDir(), "empty-bin"));
    const mods = modsFolder(["hello"]);
    return Effect.gen(function* () {
      const result = yield* runCheckMods(mods, { env: {}, repoRoot: tempDir() });
      assert.deepStrictEqual(result, {
        code: 1,
        stdout: "",
        stderr: `check:mods: couldn't run herdr-app check ${mods}/hello/ (spawnSync herdr-app ENOENT)\n`,
      });
    });
  });
});

describe("runCheckMods, bad dev config", () => {
  it.effect("exits 1 naming the file and the field, and checks nothing", () => {
    const fake = fakeHerdrHost();
    const config = writeFile(
      tempDir(),
      "herdr-dev.json",
      '{ "target": "remote", "remote": { "user": "ann" } }',
    );
    const mods = modsFolder(["hello"]);
    return Effect.gen(function* () {
      const result = yield* runCheckMods(mods, { env: { HERDR_DEV_CONFIG: config } });
      assert.deepStrictEqual(result, {
        code: 1,
        stdout: "",
        stderr: `check:mods: ${config}: remote.host: Missing key\n`,
      });
      assert.deepStrictEqual(loggedLines(fake.sshLog), []);
    });
  });

  it.effect("exits 1 naming a config file that can't be read", () => {
    const config = join(tempDir(), "missing.json");
    const mods = modsFolder(["hello"]);
    return Effect.gen(function* () {
      const result = yield* runCheckMods(mods, { env: { HERDR_DEV_CONFIG: config } });
      assert.deepStrictEqual(result, {
        code: 1,
        stdout: "",
        stderr: `check:mods: couldn't read ${config} (ENOENT: no such file or directory, open '${config}')\n`,
      });
    });
  });
});

describe("runCheckMods, nothing to check", () => {
  it.effect("exits 1 when mods/ holds no mod, so an empty build never passes", () => {
    const fake = fakeHerdrHost();
    hostCheck(fake.appBin);
    const mods = modsFolder([]);
    return Effect.gen(function* () {
      const result = yield* runCheckMods(mods, { env: { HERDR_DEV_CONFIG: fake.config } });
      assert.deepStrictEqual(result, {
        code: 1,
        stdout: "",
        stderr: `check:mods: no mods in ${mods}\n`,
      });
      assert.deepStrictEqual(loggedLines(fake.sshLog), []);
    });
  });
});

describe("check-mods CLI", () => {
  it("prints each check and exits 1 naming the mod that failed", () => {
    const fake = fakeHerdrHost();
    hostCheck(fake.appBin, ["world"]);
    const mods = modsFolder(["hello", "world"]);
    const result = spawnSync("vpx", ["scripts/check-mods.ts", mods], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: { ...process.env, HERDR_DEV_CONFIG: fake.config },
      encoding: "utf8",
    });
    assert.deepStrictEqual(
      { code: result.status, stdout: result.stdout, stderr: result.stderr },
      {
        code: 1,
        stdout: "check passed: hello\n",
        stderr: "check failed: world\ncheck:mods: failed: world\n",
      },
    );
  });
});
