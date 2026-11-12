import { afterEach, assert, describe, it, vi } from "@effect/vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Effect } from "effect";
import { runCheckMods } from "./check-mods.ts";
import { fakeBin, fakeHerdrHost, tempDir, writeFile } from "./test-support.ts";

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
