import { afterEach, assert, describe, it, vi } from "@effect/vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Result } from "effect";
import { DevTarget } from "./dev-config.ts";
import {
  CommandFailed,
  DEV_MARKER,
  FileMissing,
  HerdrHost,
  HostUnreachable,
  hostLayer,
  InstalledModInTheWay,
  TransportError,
} from "./herdr-host.ts";
import {
  fakeBin,
  fakeHerdrHost,
  fakeLoggingBin,
  loggedLines,
  tempDir,
  writeFile,
} from "./test-support.ts";

/** A file's text, or undefined when it isn't there, so a missing file fails on the assertion. */
const textOf = (path: string): string | undefined =>
  existsSync(path) ? readFileSync(path, "utf8") : undefined;

describe("HerdrHost.location, local layer", () => {
  it.effect("is the path inside the Herdr home", () => {
    const home = tempDir();
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      assert.strictEqual(host.location("mods/hello"), join(home, "mods/hello"));
    }).pipe(Effect.provide(HerdrHost.local(home)));
  });
});

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

describe("HerdrHost.writeFile, failure", () => {
  it.effect(
    "fails with TransportError, naming the operation, when the file can't be written",
    () => {
      const home = tempDir();
      writeFile(home, "mods", "a file where a folder should be");
      return Effect.gen(function* () {
        const host = yield* HerdrHost;
        // The error or the success value, so a wrong success fails on the assertion.
        const outcome = Result.merge(yield* Effect.result(host.writeFile("mods/hello/x", "")));
        const error = outcome instanceof TransportError ? outcome : undefined;
        assert.strictEqual(error?.operation, `write ${join(home, "mods/hello/x")}`);
      }).pipe(Effect.provide(HerdrHost.local(home)));
    },
  );
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

describe("HerdrHost.readFile, remote layer", () => {
  it.effect("reads a file in the Herdr home on the host over ssh", () => {
    const fake = fakeHerdrHost();
    writeFile(fake.home, "layouts/work.json", "{}\n");
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      assert.strictEqual(yield* host.readFile("layouts/work.json"), "{}\n");
    }).pipe(Effect.provide(HerdrHost.remote(fake.target)));
  });
});

describe("HerdrHost.readFile, remote layer, missing file", () => {
  it.effect("fails with FileMissing, naming the path on the host", () => {
    const fake = fakeHerdrHost();
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      const outcome = Result.merge(yield* Effect.result(host.readFile("layouts/work.json")));
      assert.deepStrictEqual(
        outcome,
        new FileMissing({ path: "ann@herdr-host:~/.config/herdr-app/layouts/work.json" }),
      );
    }).pipe(Effect.provide(HerdrHost.remote(fake.target)));
  });
});

describe("HerdrHost.readFile, remote layer, unreadable file", () => {
  it.effect("fails with TransportError naming the operation when cat fails on the host", () => {
    const fake = fakeHerdrHost();
    writeFile(fake.home, "layouts/work.json/inner", "");
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      const outcome = Result.merge(yield* Effect.result(host.readFile("layouts/work.json")));
      const error = outcome instanceof TransportError ? outcome : undefined;
      assert.strictEqual(
        error?.operation,
        "read ann@herdr-host:~/.config/herdr-app/layouts/work.json",
      );
    }).pipe(Effect.provide(HerdrHost.remote(fake.target)));
  });
});

describe("HerdrHost, remote layer, unreachable host", () => {
  it.effect("fails with HostUnreachable, saying so and naming the host and ssh's reason", () => {
    const fake = fakeHerdrHost({ unreachable: true });
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      const outcome = Result.merge(yield* Effect.result(host.readFile("layouts/work.json")));
      const error = outcome instanceof HostUnreachable ? outcome : undefined;
      assert.strictEqual(
        error?.message,
        "Herdr host unreachable: ann@herdr-host:2222 " +
          "(ssh: connect to host herdr-host port 2222: Connection refused)",
      );
    }).pipe(Effect.provide(HerdrHost.remote(fake.target)));
  });
});

describe("HerdrHost.writeFile, remote layer", () => {
  it.effect("writes a file in the Herdr home on the host, making its folders", () => {
    const fake = fakeHerdrHost();
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      yield* host.writeFile("layouts/my work.json", '{ "it\'s": 1 }\n');
      assert.strictEqual(textOf(join(fake.home, "layouts/my work.json")), '{ "it\'s": 1 }\n');
    }).pipe(Effect.provide(HerdrHost.remote(fake.target)));
  });

  it.effect("fails with TransportError naming the operation when the host can't write it", () => {
    const fake = fakeHerdrHost();
    writeFile(fake.home, "mods", "a file where a folder should be");
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      const outcome = Result.merge(yield* Effect.result(host.writeFile("mods/hello/x", "")));
      const error = outcome instanceof TransportError ? outcome : undefined;
      assert.strictEqual(error?.operation, "write ann@herdr-host:~/.config/herdr-app/mods/hello/x");
    }).pipe(Effect.provide(HerdrHost.remote(fake.target)));
  });
});

describe("HerdrHost.listDir, remote layer", () => {
  it.effect("lists a folder's entries on the host by name, sorted, hidden ones included", () => {
    const fake = fakeHerdrHost();
    writeFile(fake.home, "layouts/zebra.json", "{}");
    writeFile(fake.home, "layouts/apple pie.json", "{}");
    writeFile(fake.home, "layouts/.hidden", "");
    writeFile(fake.home, "layouts/sub/inner.json", "{}");
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      assert.deepStrictEqual(yield* host.listDir("layouts"), [
        ".hidden",
        "apple pie.json",
        "sub",
        "zebra.json",
      ]);
    }).pipe(Effect.provide(HerdrHost.remote(fake.target)));
  });
});

describe("HerdrHost.listDir, remote layer, missing folder", () => {
  it.effect("fails with FileMissing, naming the path on the host", () => {
    const fake = fakeHerdrHost();
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      const outcome = Result.merge(yield* Effect.result(host.listDir("layouts")));
      assert.deepStrictEqual(
        outcome,
        new FileMissing({ path: "ann@herdr-host:~/.config/herdr-app/layouts" }),
      );
    }).pipe(Effect.provide(HerdrHost.remote(fake.target)));
  });
});

describe("HerdrHost.modState, remote layer", () => {
  it.effect.each([
    { files: [`mods/hello/${DEV_MARKER}`], state: "DevBuild" },
    { files: ["mods/hello/main.js"], state: "Installed" },
    { files: [], state: "Missing" },
  ])("is $state for a mod folder holding $files on the host", ({ files, state }) => {
    const fake = fakeHerdrHost();
    files.forEach((file) => writeFile(fake.home, file, ""));
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      assert.strictEqual(yield* host.modState("hello"), state);
    }).pipe(Effect.provide(HerdrHost.remote(fake.target)));
  });
});

describe("HerdrHost.removeDevBuild, remote layer", () => {
  it.effect("removes a dev build's folder on the host and says so", () => {
    const fake = fakeHerdrHost();
    writeFile(fake.home, `mods/hello/${DEV_MARKER}`, "");
    writeFile(fake.home, "mods/hello/main.js", "");
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      assert.strictEqual(yield* host.removeDevBuild("hello"), "Removed");
      assert.isFalse(existsSync(join(fake.home, "mods/hello")));
    }).pipe(Effect.provide(HerdrHost.remote(fake.target)));
  });
});

describe("HerdrHost.removeDevBuild, remote layer, installed mod", () => {
  it.effect("fails with InstalledModInTheWay and leaves an installed mod on the host alone", () => {
    const fake = fakeHerdrHost();
    const main = writeFile(fake.home, "mods/hello/main.js", "installed");
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      const outcome = Result.merge(yield* Effect.result(host.removeDevBuild("hello")));
      assert.deepStrictEqual(
        outcome,
        new InstalledModInTheWay({ path: "ann@herdr-host:~/.config/herdr-app/mods/hello" }),
      );
      assert.strictEqual(textOf(main), "installed");
    }).pipe(Effect.provide(HerdrHost.remote(fake.target)));
  });
});

describe("HerdrHost.removeDevBuild, remote layer, no folder", () => {
  it.effect("is Missing when the mod has no folder on the host", () => {
    const fake = fakeHerdrHost();
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      const outcome = Result.merge(yield* Effect.result(host.removeDevBuild("hello")));
      assert.strictEqual(outcome, "Missing");
    }).pipe(Effect.provide(HerdrHost.remote(fake.target)));
  });
});

describe("HerdrHost.herdrApp, remote layer", () => {
  it.effect(
    "runs herdr-app by its full path on the host, every argument reaching it unchanged",
    () => {
      const fake = fakeHerdrHost();
      const log = join(fake.root, "app.log");
      // One line per argument, so a split or re-joined argument shows.
      fakeBin(fake.appBin, "herdr-app", `for a; do printf '%s\\n' "$a" >> '${log}'; done; echo ok`);
      const args = ["check", "my mod/", `it's "quoted"`, "$HOME", "a;b", ""];
      return Effect.gen(function* () {
        const host = yield* HerdrHost;
        const output = yield* host.herdrApp(args);
        assert.strictEqual(output.stdout, "ok\n");
        assert.strictEqual(textOf(log), `${args.join("\n")}\n`);
      }).pipe(Effect.provide(HerdrHost.remote(fake.target)));
    },
  );
});

describe("HerdrHost.herdrApp, remote layer, failure", () => {
  it.effect(
    "fails with CommandFailed, with the exit code and output, when herdr-app exits non-zero",
    () => {
      const fake = fakeHerdrHost();
      fakeBin(fake.appBin, "herdr-app", "echo out; echo 'not running' >&2; exit 3");
      return Effect.gen(function* () {
        const host = yield* HerdrHost;
        const outcome = Result.merge(yield* Effect.result(host.herdrApp(["status"])));
        assert.deepStrictEqual(
          outcome,
          new CommandFailed({ code: 3, stdout: "out\n", stderr: "not running\n" }),
        );
      }).pipe(Effect.provide(HerdrHost.remote(fake.target)));
    },
  );
});

describe("HerdrHost.syncInto, remote layer", () => {
  it.effect(
    "copies a local folder into the Herdr home with rsync, keeping files Herdr wrote",
    () => {
      const fake = fakeHerdrHost();
      const staging = join(tempDir(), "staging");
      writeFile(staging, "main.js", "new build");
      writeFile(staging, "assets/icon.svg", "<svg/>");
      writeFile(fake.home, "mods/hello/main.js", "old build");
      writeFile(fake.home, "mods/hello/state.json", "written by Herdr");
      return Effect.gen(function* () {
        const host = yield* HerdrHost;
        yield* host.syncInto(staging, "mods/hello");
        assert.strictEqual(textOf(join(fake.home, "mods/hello/main.js")), "new build");
        assert.strictEqual(textOf(join(fake.home, "mods/hello/assets/icon.svg")), "<svg/>");
        assert.strictEqual(textOf(join(fake.home, "mods/hello/state.json")), "written by Herdr");
        assert.deepStrictEqual(loggedLines(fake.rsyncLog), [
          "-rlt -e ssh -p 2222 -o ConnectTimeout=5 -o BatchMode=yes -l ann " +
            `${staging}/ ann@herdr-host:.config/herdr-app/mods/hello/`,
        ]);
      }).pipe(Effect.provide(HerdrHost.remote(fake.target)));
    },
  );
});

describe("HerdrHost.syncInto, local layer", () => {
  it.effect("copies a local folder into the Herdr home, keeping files Herdr wrote", () => {
    const home = tempDir();
    const staging = join(tempDir(), "staging");
    writeFile(staging, "main.js", "new build");
    writeFile(staging, "assets/icon.svg", "<svg/>");
    writeFile(home, "mods/hello/main.js", "old build");
    writeFile(home, "mods/hello/state.json", "written by Herdr");
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      yield* host.syncInto(staging, "mods/hello");
      assert.strictEqual(textOf(join(home, "mods/hello/main.js")), "new build");
      assert.strictEqual(textOf(join(home, "mods/hello/assets/icon.svg")), "<svg/>");
      assert.strictEqual(textOf(join(home, "mods/hello/state.json")), "written by Herdr");
    }).pipe(Effect.provide(HerdrHost.local(home)));
  });
});

describe("HerdrHost.copyBack, remote layer", () => {
  it.effect("copies a file on the host to a local path with rsync", () => {
    const fake = fakeHerdrHost();
    writeFile(fake.root, "tmp/shot.png", "png bytes");
    const out = join(tempDir(), "shot.png");
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      yield* host.copyBack(join(fake.root, "tmp/shot.png"), out);
      assert.strictEqual(textOf(out), "png bytes");
      assert.deepStrictEqual(loggedLines(fake.rsyncLog), [
        "-rlt -e ssh -p 2222 -o ConnectTimeout=5 -o BatchMode=yes -l ann " +
          `ann@herdr-host:${join(fake.root, "tmp/shot.png")} ${out}`,
      ]);
    }).pipe(Effect.provide(HerdrHost.remote(fake.target)));
  });
});

describe("HerdrHost.copyBack, local layer", () => {
  it.effect("copies a file in the Herdr home to a local path", () => {
    const home = tempDir();
    writeFile(home, "shots/shot.png", "png bytes");
    const out = join(tempDir(), "shot.png");
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      yield* host.copyBack("shots/shot.png", out);
      assert.strictEqual(textOf(out), "png bytes");
    }).pipe(Effect.provide(HerdrHost.local(home)));
  });
});

describe("HerdrHost.makeTempDir and removeTempDir, remote layer", () => {
  it.effect("makes an empty folder in the host's temp folder, then removes it", () => {
    const fake = fakeHerdrHost();
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      const dir = yield* host.makeTempDir;
      assert.isTrue(dir.startsWith(join(fake.root, "tmp/")));
      assert.deepStrictEqual(existsSync(dir) ? readdirSync(dir) : undefined, []);
      writeFile(dir, "mods/hello/main.js", "");
      yield* host.removeTempDir(dir);
      assert.isFalse(existsSync(dir));
    }).pipe(Effect.provide(HerdrHost.remote(fake.target)));
  });
});

describe("HerdrHost.makeTempDir and removeTempDir, local layer", () => {
  it.effect("makes an empty folder in the temp folder, then removes it", () => {
    const home = tempDir();
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      const dir = yield* host.makeTempDir;
      assert.isTrue(dir.startsWith(tmpdir()));
      assert.deepStrictEqual(existsSync(dir) ? readdirSync(dir) : undefined, []);
      writeFile(dir, "mods/hello/main.js", "");
      yield* host.removeTempDir(dir);
      assert.isFalse(existsSync(dir));
    }).pipe(Effect.provide(HerdrHost.local(home)));
  });
});

describe("HerdrHost.syncInto, remote layer, unreachable host", () => {
  it.effect("fails with HostUnreachable when rsync's ssh can't connect", () => {
    const fake = fakeHerdrHost({ unreachable: true });
    const staging = join(tempDir(), "staging");
    writeFile(staging, "main.js", "");
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      const outcome = Result.merge(yield* Effect.result(host.syncInto(staging, "mods/hello")));
      assert.strictEqual(
        outcome instanceof HostUnreachable ? outcome._tag : outcome,
        "HostUnreachable",
      );
    }).pipe(Effect.provide(HerdrHost.remote(fake.target)));
  });
});

describe("HerdrHost, remote layer, ssh options", () => {
  it.effect("every ssh call carries the port, a 5 second connect timeout and batch mode", () => {
    const fake = fakeHerdrHost();
    writeFile(fake.home, "layouts/work.json", "{}");
    fakeBin(fake.appBin, "herdr-app", "true");
    const options = "-p 2222 -o ConnectTimeout=5 -o BatchMode=yes -l ann herdr-host ";
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      yield* host.readFile("layouts/work.json");
      yield* host.writeFile("layouts/work.json", "{}");
      yield* host.listDir("layouts");
      yield* host.modState("hello");
      yield* host.removeDevBuild("hello");
      yield* host.herdrApp(["status"]);
      yield* host.removeTempDir(yield* host.makeTempDir);
      const calls = loggedLines(fake.sshLog);
      assert.strictEqual(calls.length, 8);
      assert.deepStrictEqual(
        calls.filter((call) => !call.startsWith(options)),
        [],
      );
    }).pipe(Effect.provide(HerdrHost.remote(fake.target)));
  });
});

describe("hostLayer", () => {
  it.effect("reaches the Herdr host over ssh for a remote dev target", () => {
    const fake = fakeHerdrHost();
    writeFile(fake.home, "layouts/work.json", "remote");
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      // The error or the success value, so reading the wrong place fails on the assertion.
      const outcome = Result.merge(yield* Effect.result(host.readFile("layouts/work.json")));
      assert.strictEqual(outcome, "remote");
    }).pipe(Effect.provide(hostLayer(DevTarget.Remote(fake.target))));
  });

  it.effect("uses the Herdr app on this machine for a local dev target", () => {
    const home = tempDir();
    writeFile(home, "layouts/work.json", "local");
    const target = DevTarget.Local({ herdrHome: home, file: "herdr-dev.json", found: false });
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      assert.strictEqual(yield* host.readFile("layouts/work.json"), "local");
    }).pipe(Effect.provide(hostLayer(target)));
  });
});

describe("HerdrHost.cropImage, remote layer", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.effect(
    "crops the image on the host with sips: height and width, then the y and x offset",
    () => {
      const fake = fakeHerdrHost();
      vi.stubEnv("PATH", `${fake.appBin}:${process.env.PATH ?? ""}`);
      const sipsLog = join(tempDir(), "sips.log");
      fakeBin(fake.appBin, "sips", `printf '%s\\n' "$*" >> '${sipsLog}'; printf cropped > "$7"`);
      const shot = writeFile(fake.root, "tmp/shot.png", "full");
      return Effect.gen(function* () {
        const host = yield* HerdrHost;
        yield* host.cropImage(shot, { x: 10, y: 20, width: 300, height: 400 });
        assert.deepStrictEqual(loggedLines(sipsLog), [`-c 400 300 --cropOffset 20 10 ${shot}`]);
        assert.strictEqual(textOf(shot), "cropped");
      }).pipe(Effect.provide(HerdrHost.remote(fake.target)));
    },
  );
});

describe("HerdrHost.cropImage, local layer", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.effect("crops the image with sips from PATH", () => {
    const bin = join(tempDir(), "bin");
    vi.stubEnv("PATH", `${bin}:${process.env.PATH ?? ""}`);
    const sipsLog = join(tempDir(), "sips.log");
    fakeBin(bin, "sips", `printf '%s\\n' "$*" >> '${sipsLog}'; printf cropped > "$7"`);
    const shot = writeFile(tempDir(), "shot.png", "full");
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      yield* host.cropImage(shot, { x: 10, y: 20, width: 300, height: 400 });
      assert.deepStrictEqual(loggedLines(sipsLog), [`-c 400 300 --cropOffset 20 10 ${shot}`]);
      assert.strictEqual(textOf(shot), "cropped");
    }).pipe(Effect.provide(HerdrHost.local(tempDir())));
  });

  it.effect("fails with CommandFailed when sips exits non-zero", () => {
    const bin = join(tempDir(), "bin");
    vi.stubEnv("PATH", `${bin}:${process.env.PATH ?? ""}`);
    fakeBin(bin, "sips", "echo 'bad image' >&2; exit 13");
    const shot = writeFile(tempDir(), "shot.png", "full");
    return Effect.gen(function* () {
      const host = yield* HerdrHost;
      const outcome = Result.merge(
        yield* Effect.result(host.cropImage(shot, { x: 0, y: 0, width: 1, height: 1 })),
      );
      assert.deepStrictEqual(
        outcome,
        new CommandFailed({ code: 13, stdout: "", stderr: "bad image\n" }),
      );
    }).pipe(Effect.provide(HerdrHost.local(tempDir())));
  });
});
