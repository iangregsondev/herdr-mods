import { afterEach, assert, describe, it, vi } from "@effect/vitest";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { DevTarget } from "./dev-config.ts";
import { refreshHerdrTypes, runHerdrTypes } from "./herdr-types.ts";
import { fakeHerdrHost, loggedLines, tempDir, writeFile } from "./test-support.ts";

const typeFiles = ["herdr.d.ts", "gpui-kit.d.ts"] as const;

/** A Herdr home holding the named type files. */
const fakeApp = (dir: string, files: ReadonlyArray<string>): string => {
  mkdirSync(dir, { recursive: true });
  files.forEach((file) => writeFile(dir, file, `// ${file}\n`));
  return dir;
};

/** A local dev target whose Herdr home is `home`. */
const local = (home: string): DevTarget =>
  DevTarget.Local({ herdrHome: home, file: "herdr-dev.json", found: false, layout: "Workbench" });

/** What `path` is: a link (with its target), a real file, or nothing. */
const entry = (path: string): string => {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat === undefined) return "missing";
  return stat.isSymbolicLink() ? `link to ${readlinkSync(path)}` : "file";
};

/** What the file at `path` holds, following links; "unreadable" when nothing is there. */
const content = (path: string): string =>
  existsSync(path) ? readFileSync(path, "utf8") : "unreadable";

/** Asserts `dest` holds a link to each type file in `app`. */
const assertLinked = (dest: string, app: string): void =>
  assert.deepStrictEqual(
    typeFiles.map((file) => entry(join(dest, file))),
    typeFiles.map((file) => `link to ${join(app, file)}`),
  );

describe("refreshHerdrTypes, local target", () => {
  it.effect("links both type files into the destination", () => {
    const root = tempDir();
    const app = fakeApp(join(root, "app"), typeFiles);
    const dest = join(root, "repo", ".herdr-types");
    return Effect.gen(function* () {
      const result = yield* refreshHerdrTypes(local(app), dest);
      assert.strictEqual(result.code, 0);
      assertLinked(dest, app);
    });
  });

  it.effect("a second run repoints the links at the current app", () => {
    const root = tempDir();
    const first = fakeApp(join(root, "app1"), typeFiles);
    const second = fakeApp(join(root, "app2"), typeFiles);
    const dest = join(root, "repo", ".herdr-types");
    return Effect.gen(function* () {
      yield* refreshHerdrTypes(local(first), dest);
      const result = yield* refreshHerdrTypes(local(second), dest);
      assert.strictEqual(result.code, 0);
      assertLinked(dest, second);
    });
  });

  it.effect.each([
    ["no type files", []],
    ["only herdr.d.ts", ["herdr.d.ts"]],
    ["only gpui-kit.d.ts", ["gpui-kit.d.ts"]],
  ] as const)("warns, exits 0 and makes nothing when the app has %s", ([, files]) => {
    const root = tempDir();
    const app = fakeApp(join(root, "app"), files);
    const dest = join(root, "repo", ".herdr-types");
    return Effect.gen(function* () {
      const result = yield* refreshHerdrTypes(local(app), dest);
      assert.deepStrictEqual(result, {
        code: 0,
        stdout: "",
        stderr: `herdr-types: no Herdr app types in ${app}; skipping (mod type-checks will fail)\n`,
      });
      assert.isFalse(existsSync(dest), "the destination isn't made");
    });
  });
});

describe("refreshHerdrTypes, what it says", () => {
  it.effect("says it linked the types from the local Herdr home", () => {
    const root = tempDir();
    const app = fakeApp(join(root, "app"), typeFiles);
    const dest = join(root, "repo", ".herdr-types");
    return Effect.gen(function* () {
      const result = yield* refreshHerdrTypes(local(app), dest);
      assert.deepStrictEqual(result, {
        code: 0,
        stdout: `herdr-types: linked ${app}/{herdr,gpui-kit}.d.ts -> ${dest}\n`,
        stderr: "",
      });
    });
  });

  it.effect("says it copied the types from the Herdr host", () => {
    const fake = fakeHerdrHost();
    fakeApp(fake.home, typeFiles);
    const dest = join(tempDir(), "repo", ".herdr-types");
    return Effect.gen(function* () {
      const result = yield* refreshHerdrTypes(DevTarget.Remote(fake.target), dest);
      assert.deepStrictEqual(result, {
        code: 0,
        stdout:
          "herdr-types: copied ann@herdr-host:~/.config/herdr-app/{herdr,gpui-kit}.d.ts " +
          `-> ${dest}\n`,
        stderr: "",
      });
    });
  });
});

describe("refreshHerdrTypes, destination can't be written", () => {
  it.effect("exits 1 naming what it couldn't do", () => {
    const root = tempDir();
    const app = fakeApp(join(root, "app"), typeFiles);
    const blocker = writeFile(root, "repo", "a file where the repo folder should be\n");
    const dest = join(blocker, ".herdr-types");
    return Effect.gen(function* () {
      const result = yield* refreshHerdrTypes(local(app), dest);
      assert.strictEqual(result.code, 1);
      assert.match(result.stderr, new RegExp(`^herdr-types: couldn't make ${dest} \\(.+\\)\n$`));
    });
  });
});

describe("refreshHerdrTypes, remote target", () => {
  it.effect("copies both type files from the Herdr host as real files", () => {
    const fake = fakeHerdrHost();
    fakeApp(fake.home, typeFiles);
    const dest = join(tempDir(), "repo", ".herdr-types");
    return Effect.gen(function* () {
      const result = yield* refreshHerdrTypes(DevTarget.Remote(fake.target), dest);
      assert.strictEqual(result.code, 0);
      assert.deepStrictEqual(
        typeFiles.map((file) => [entry(join(dest, file)), content(join(dest, file))]),
        typeFiles.map((file) => ["file", `// ${file}\n`]),
      );
    });
  });

  it.effect("replaces dangling links in the destination with real files", () => {
    const fake = fakeHerdrHost();
    fakeApp(fake.home, typeFiles);
    const dest = join(tempDir(), "repo", ".herdr-types");
    mkdirSync(dest, { recursive: true });
    typeFiles.forEach((file) => symlinkSync(join("/no/such/machine", file), join(dest, file)));
    return Effect.gen(function* () {
      const result = yield* refreshHerdrTypes(DevTarget.Remote(fake.target), dest);
      assert.strictEqual(result.code, 0);
      assert.deepStrictEqual(
        typeFiles.map((file) => [entry(join(dest, file)), content(join(dest, file))]),
        typeFiles.map((file) => ["file", `// ${file}\n`]),
      );
    });
  });

  it.effect("warns and exits 0, making nothing, when the Herdr host is unreachable", () => {
    const fake = fakeHerdrHost({ unreachable: true });
    const dest = join(tempDir(), "repo", ".herdr-types");
    return Effect.gen(function* () {
      const result = yield* refreshHerdrTypes(DevTarget.Remote(fake.target), dest);
      assert.deepStrictEqual(result, {
        code: 0,
        stdout: "",
        stderr:
          "herdr-types: Herdr host unreachable: ann@herdr-host:2222 " +
          "(ssh: connect to host herdr-host port 2222: Connection refused); " +
          "skipping (mod type-checks will fail)\n",
      });
      assert.isFalse(existsSync(dest), "the destination isn't made");
    });
  });

  it.effect("warns and exits 0 when the Herdr host has no type files", () => {
    const fake = fakeHerdrHost();
    fakeApp(fake.home, ["herdr.d.ts"]);
    const dest = join(tempDir(), "repo", ".herdr-types");
    return Effect.gen(function* () {
      const result = yield* refreshHerdrTypes(DevTarget.Remote(fake.target), dest);
      assert.deepStrictEqual(result, {
        code: 0,
        stdout: "",
        stderr:
          "herdr-types: no Herdr app types in ann@herdr-host:~/.config/herdr-app; " +
          "skipping (mod type-checks will fail)\n",
      });
      assert.isFalse(existsSync(dest), "the destination isn't made");
    });
  });
});

describe("runHerdrTypes", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.effect(
    "with no dev config, links from $HOME/.config/herdr-app when HERDR_APP_HOME is unset",
    () => {
      const root = tempDir();
      const home = join(root, "home");
      vi.stubEnv("HOME", home);
      const app = fakeApp(join(home, ".config", "herdr-app"), typeFiles);
      const dest = join(root, "repo", ".herdr-types");
      return Effect.gen(function* () {
        const result = yield* runHerdrTypes(dest, { env: {}, repoRoot: join(root, "repo") });
        assert.strictEqual(result.code, 0);
        assertLinked(dest, app);
      });
    },
  );

  it.effect("exits 1 naming the file and the field when the dev config is invalid", () => {
    const fake = fakeHerdrHost();
    const config = writeFile(
      tempDir(),
      "herdr-dev.json",
      '{ "target": "remote", "remote": { "user": "ann" } }',
    );
    const dest = join(tempDir(), "repo", ".herdr-types");
    return Effect.gen(function* () {
      const result = yield* runHerdrTypes(dest, { env: { HERDR_DEV_CONFIG: config } });
      assert.deepStrictEqual(result, {
        code: 1,
        stdout: "",
        stderr: `herdr-types: ${config}: remote.host: Missing key\n`,
      });
      assert.deepStrictEqual(loggedLines(fake.sshLog), []);
    });
  });

  it.effect("exits 1 naming a dev config file that can't be read", () => {
    const config = join(tempDir(), "missing.json");
    const dest = join(tempDir(), "repo", ".herdr-types");
    return Effect.gen(function* () {
      const result = yield* runHerdrTypes(dest, { env: { HERDR_DEV_CONFIG: config } });
      assert.deepStrictEqual(result, {
        code: 1,
        stdout: "",
        stderr: `herdr-types: couldn't read ${config} (ENOENT: no such file or directory, open '${config}')\n`,
      });
    });
  });
});

describe("herdr-types CLI", () => {
  const run = (args: ReadonlyArray<string>, env: NodeJS.ProcessEnv) => {
    const result = spawnSync("vpx", ["scripts/herdr-types.ts", ...args], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: { ...process.env, ...env },
      encoding: "utf8",
    });
    return { code: result.status, stdout: result.stdout, stderr: result.stderr };
  };

  it("copies the types from the dev target's Herdr host into the folder it's given", () => {
    const fake = fakeHerdrHost();
    fakeApp(fake.home, typeFiles);
    const dest = join(tempDir(), "types");
    const result = run([dest], { HERDR_DEV_CONFIG: fake.config });
    assert.deepStrictEqual(result, {
      code: 0,
      stdout:
        "herdr-types: copied ann@herdr-host:~/.config/herdr-app/{herdr,gpui-kit}.d.ts " +
        `-> ${dest}\n`,
      stderr: "",
    });
    assert.deepStrictEqual(
      typeFiles.map((file) => content(join(dest, file))),
      typeFiles.map((file) => `// ${file}\n`),
    );
  });

  it("exits 0 with a warning when the Herdr host is unreachable, so an install goes on", () => {
    const fake = fakeHerdrHost({ unreachable: true });
    const result = run([join(tempDir(), "types")], { HERDR_DEV_CONFIG: fake.config });
    assert.strictEqual(result.code, 0);
    assert.match(result.stderr, /^herdr-types: Herdr host unreachable: .*; skipping/);
  });
});
