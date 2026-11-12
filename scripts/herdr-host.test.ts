import { afterEach, assert, describe, it, vi } from "@effect/vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Effect, Result } from "effect";
import {
  CommandFailed,
  DEV_MARKER,
  FileMissing,
  HerdrHost,
  InstalledModInTheWay,
  TransportError,
} from "./herdr-host.ts";
import { fakeBin, fakeLoggingBin, loggedLines, tempDir, writeFile } from "./test-support.ts";

/** A file's text, or undefined when it isn't there, so a missing file fails on the assertion. */
const textOf = (path: string): string | undefined =>
  existsSync(path) ? readFileSync(path, "utf8") : undefined;

describe("HerdrHost, local layer", () => {
  it.effect("reads a file in the Herdr home", () => {
    const home = tempDir();
    writeFile(home, "layouts/work.json", "{}\n");
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      assert.strictEqual(yield* host.readFile("layouts/work.json"), "{}\n");
    }).pipe(Effect.provide(HerdrHost.local(home)));
  });

  it.effect("fails with FileMissing, naming the path, when the file isn't there", () => {
    const home = tempDir();
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      const error = yield* Effect.flip(host.readFile("layouts/work.json"));
      assert.deepStrictEqual(error, new FileMissing({ path: join(home, "layouts/work.json") }));
    }).pipe(Effect.provide(HerdrHost.local(home)));
  });

  it.effect("fails with TransportError, naming the operation, when the path can't be read", () => {
    const home = tempDir();
    writeFile(home, "layouts/work.json/inner", "");
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      const error = yield* Effect.flip(host.readFile("layouts/work.json"));
      assert.strictEqual(error._tag, "TransportError");
      assert.strictEqual(
        error._tag === "TransportError" ? error.operation : "",
        `read ${join(home, "layouts/work.json")}`,
      );
    }).pipe(Effect.provide(HerdrHost.local(home)));
  });
});

describe("HerdrHost.writeFile, local layer", () => {
  it.effect("writes a file in the Herdr home, making its folders", () => {
    const home = tempDir();
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      yield* host.writeFile("mods/hello/.marker", "dev\n");
      assert.strictEqual(textOf(join(home, "mods/hello/.marker")), "dev\n");
    }).pipe(Effect.provide(HerdrHost.local(home)));
  });
});

describe("HerdrHost.listDir, local layer", () => {
  it.effect("lists a folder's entries by name, sorted", () => {
    const home = tempDir();
    writeFile(home, "layouts/zebra.json", "{}");
    writeFile(home, "layouts/apple.json", "{}");
    writeFile(home, "layouts/sub/inner.json", "{}");
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      assert.deepStrictEqual(yield* host.listDir("layouts"), ["apple.json", "sub", "zebra.json"]);
    }).pipe(Effect.provide(HerdrHost.local(home)));
  });
});

describe("HerdrHost.listDir, missing folder", () => {
  it.effect("fails with FileMissing, naming the path, when the folder isn't there", () => {
    const home = tempDir();
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      const error = yield* Effect.flip(host.listDir("layouts"));
      assert.deepStrictEqual(error, new FileMissing({ path: join(home, "layouts") }));
    }).pipe(Effect.provide(HerdrHost.local(home)));
  });
});

describe("HerdrHost.modState, local layer", () => {
  it.effect("is Installed for a mod folder without the dev marker", () => {
    const home = tempDir();
    writeFile(home, "mods/hello/main.js", "");
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      assert.strictEqual(yield* host.modState("hello"), "Installed");
    }).pipe(Effect.provide(HerdrHost.local(home)));
  });
});

describe("HerdrHost.modState, dev build", () => {
  it.effect("is DevBuild for a mod folder with the dev marker", () => {
    const home = tempDir();
    writeFile(home, `mods/hello/${DEV_MARKER}`, "");
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      assert.strictEqual(yield* host.modState("hello"), "DevBuild");
    }).pipe(Effect.provide(HerdrHost.local(home)));
  });
});

describe("HerdrHost.modState, no folder", () => {
  it.effect("is Missing when the mod has no folder", () => {
    const home = tempDir();
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      assert.strictEqual(yield* host.modState("hello"), "Missing");
    }).pipe(Effect.provide(HerdrHost.local(home)));
  });
});

describe("HerdrHost.removeDevBuild, local layer", () => {
  it.effect("removes a dev build's folder and says so", () => {
    const home = tempDir();
    writeFile(home, `mods/hello/${DEV_MARKER}`, "");
    writeFile(home, "mods/hello/main.js", "");
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      assert.strictEqual(yield* host.removeDevBuild("hello"), "Removed");
      assert.isFalse(existsSync(join(home, "mods/hello")));
    }).pipe(Effect.provide(HerdrHost.local(home)));
  });
});

describe("HerdrHost.removeDevBuild, installed mod", () => {
  it.effect("fails with InstalledModInTheWay and leaves an installed mod alone", () => {
    const home = tempDir();
    const main = writeFile(home, "mods/hello/main.js", "installed");
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      // The error or the success value, so a wrong success fails on the assertion.
      const outcome = Result.merge(yield* Effect.result(host.removeDevBuild("hello")));
      assert.deepStrictEqual(outcome, new InstalledModInTheWay({ path: join(home, "mods/hello") }));
      assert.strictEqual(textOf(main), "installed");
    }).pipe(Effect.provide(HerdrHost.local(home)));
  });
});

describe("HerdrHost.removeDevBuild, no folder", () => {
  it.effect("is Missing when the mod has no folder", () => {
    const home = tempDir();
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      // The error or the success value, so a wrong error fails on the assertion.
      const outcome = Result.merge(yield* Effect.result(host.removeDevBuild("hello")));
      assert.strictEqual(outcome, "Missing");
    }).pipe(Effect.provide(HerdrHost.local(home)));
  });
});

describe("HerdrHost.herdrApp, local layer", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /** A temp folder holding `herdr-app`, put first on PATH for this test. */
  const onPath = (): string => {
    const bin = join(tempDir(), "bin");
    vi.stubEnv("PATH", `${bin}:${process.env.PATH ?? ""}`);
    return bin;
  };

  it.effect("runs herdr-app from PATH with the arguments and gives its output", () => {
    const bin = onPath();
    const log = join(bin, "..", "calls.log");
    fakeLoggingBin(bin, "herdr-app", { log, output: '{"layout":"work"}' });
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      const output = yield* host.herdrApp(["status", "--json"]);
      assert.strictEqual(output.stdout, '{"layout":"work"}');
      assert.deepStrictEqual(loggedLines(log), ["status --json"]);
    }).pipe(Effect.provide(HerdrHost.local(tempDir())));
  });

  it.effect(
    "fails with CommandFailed, with the exit code and output, when herdr-app exits non-zero",
    () => {
      fakeBin(onPath(), "herdr-app", "echo out; echo 'not running' >&2; exit 3");
      return Effect.gen(function* () {
        const host = yield* HerdrHost;
        // The error or the success value, so a wrong success fails on the assertion.
        const outcome = Result.merge(yield* Effect.result(host.herdrApp(["status"])));
        assert.deepStrictEqual(
          outcome,
          new CommandFailed({ code: 3, stdout: "out\n", stderr: "not running\n" }),
        );
      }).pipe(Effect.provide(HerdrHost.local(tempDir())));
    },
  );

  it.effect("fails with TransportError when herdr-app can't start", () => {
    vi.stubEnv("PATH", join(tempDir(), "empty-bin"));
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      // The error or the success value, so a wrong outcome fails on the assertion.
      const outcome = Result.merge(yield* Effect.result(host.herdrApp(["status"])));
      const error = outcome instanceof TransportError ? outcome : undefined;
      assert.strictEqual(error?.operation, "run herdr-app status");
    }).pipe(Effect.provide(HerdrHost.local(tempDir())));
  });
});
