import { afterEach, assert, describe, it, vi } from "@effect/vitest";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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

/** A file's text, or undefined when it isn't there, so a missing file fails on the assertion. */
const textOf = (path: string): string | undefined =>
  existsSync(path) ? readFileSync(path, "utf8") : undefined;

/** A fake host `herdr-app` that logs its arguments and saves "full window" for `shot <file>`. */
const fakeShooter = (bin: string, log: string): void =>
  fakeBin(
    bin,
    "herdr-app",
    `printf '%s\\n' "$*" >> '${log}'; [ "$1" = shot ] && printf 'full window' > "$2"; true`,
  );

describe("runHerdr shot, remote target", () => {
  it.effect("saves the full window at <file>, shot into a temp folder on the host", () => {
    const fake = fakeHerdrHost();
    const appLog = join(tempDir(), "app.log");
    fakeShooter(fake.appBin, appLog);
    const out = join(tempDir(), "shot.png");
    return Effect.gen(function* () {
      const result = yield* runHerdr(["shot", out], { env: { HERDR_DEV_CONFIG: fake.config } });
      assert.deepStrictEqual(result, { code: 0, stdout: `saved ${out}\n`, stderr: "" });
      assert.strictEqual(textOf(out), "full window");
      const [call = ""] = loggedLines(appLog);
      assert.match(
        call,
        new RegExp(`^shot ${join(fake.root, "tmp")}/herdr-mods\\.[^/]+/shot\\.png$`),
      );
    });
  });
});

describe("runHerdr shot --crop, remote target", () => {
  it.effect("crops on the host with sips before copying the image back", () => {
    const fake = fakeHerdrHost();
    // sips is on the host's PATH; the fake one sits with the fake herdr-app.
    vi.stubEnv("PATH", `${fake.appBin}:${process.env.PATH ?? ""}`);
    fakeShooter(fake.appBin, join(tempDir(), "app.log"));
    const sipsLog = join(tempDir(), "sips.log");
    fakeBin(fake.appBin, "sips", `printf '%s\\n' "$*" >> '${sipsLog}'; printf cropped > "$7"`);
    const out = join(tempDir(), "shot.png");
    return Effect.gen(function* () {
      const result = yield* runHerdr(["shot", out, "--crop", "10,20,300,400"], {
        env: { HERDR_DEV_CONFIG: fake.config },
      });
      assert.deepStrictEqual(result, { code: 0, stdout: `saved ${out}\n`, stderr: "" });
      assert.strictEqual(textOf(out), "cropped");
      const [call = ""] = loggedLines(sipsLog);
      assert.match(
        call,
        new RegExp(
          `^-c 400 300 --cropOffset 20 10 ${join(fake.root, "tmp")}/herdr-mods\\.[^/]+/shot\\.png$`,
        ),
      );
      assert.deepStrictEqual(readdirSync(join(fake.root, "tmp")), []);
    });
  });
});

describe("runHerdr shot, malformed --crop", () => {
  const usage = "usage: vp run herdr shot <file> [--crop x,y,w,h]\n";
  const malformed = [
    "10,20,300",
    "10,20,300,400,5",
    "a,20,300,400",
    "10,20,0,400",
    "-1,20,300,400",
    "1.5,20,300,400",
    "",
  ];

  malformed.forEach((value) => {
    it.effect(`exits 2 with usage for --crop "${value}", and runs nothing on the host`, () => {
      const fake = fakeHerdrHost();
      const out = join(tempDir(), "shot.png");
      return Effect.gen(function* () {
        const result = yield* runHerdr(["shot", out, "--crop", value], {
          env: { HERDR_DEV_CONFIG: fake.config },
        });
        assert.deepStrictEqual(result, {
          code: 2,
          stdout: "",
          stderr: `herdr: --crop wants x,y,w,h: whole numbers, w and h above 0 (got "${value}")\n${usage}`,
        });
        assert.deepStrictEqual(loggedLines(fake.sshLog), []);
        assert.deepStrictEqual(loggedLines(fake.rsyncLog), []);
      });
    });
  });
});

describe("runHerdr shot, bad arguments", () => {
  const usage = "usage: vp run herdr shot <file> [--crop x,y,w,h]\n";
  const cases: ReadonlyArray<readonly [ReadonlyArray<string>, string]> = [
    [["shot"], "shot wants a <file>"],
    [["shot", "--crop", "1,2,3,4"], "shot wants a <file>"],
    [["shot", "a.png", "--zoom", "2"], 'unexpected argument "--zoom"'],
    [["shot", "a.png", "--crop", "1,2,3,4", "b.png"], 'unexpected argument "b.png"'],
  ];

  cases.forEach(([args, problem]) => {
    it.effect(`exits 2 with usage for "${args.join(" ")}", and runs nothing on the host`, () => {
      const fake = fakeHerdrHost();
      return Effect.gen(function* () {
        const result = yield* runHerdr(args, { env: { HERDR_DEV_CONFIG: fake.config } });
        assert.deepStrictEqual(result, {
          code: 2,
          stdout: "",
          stderr: `herdr: ${problem}\n${usage}`,
        });
        assert.deepStrictEqual(loggedLines(fake.sshLog), []);
      });
    });
  });
});

describe("runHerdr shot, temp folder on the host", () => {
  it.effect("is removed after a good shot", () => {
    const fake = fakeHerdrHost();
    fakeShooter(fake.appBin, join(tempDir(), "app.log"));
    const out = join(tempDir(), "shot.png");
    return Effect.gen(function* () {
      yield* runHerdr(["shot", out], { env: { HERDR_DEV_CONFIG: fake.config } });
      assert.deepStrictEqual(readdirSync(join(fake.root, "tmp")), []);
    });
  });

  it.effect("is removed when the shot fails, and herdr-app's exit code and output pass on", () => {
    const fake = fakeHerdrHost();
    fakeBin(fake.appBin, "herdr-app", `: > "$2"; echo 'no window' >&2; exit 3`);
    const out = join(tempDir(), "shot.png");
    return Effect.gen(function* () {
      const result = yield* runHerdr(["shot", out], { env: { HERDR_DEV_CONFIG: fake.config } });
      assert.deepStrictEqual(result, { code: 3, stdout: "", stderr: "no window\n" });
      assert.deepStrictEqual(readdirSync(join(fake.root, "tmp")), []);
      assert.isFalse(existsSync(out));
    });
  });
});

describe("runHerdr shot, copy back fails", () => {
  it.effect("exits 1 naming the copy and rsync's error, and removes the temp folder", () => {
    const fake = fakeHerdrHost();
    fakeShooter(fake.appBin, join(tempDir(), "app.log"));
    const out = join(tempDir(), "no-such-folder", "shot.png");
    return Effect.gen(function* () {
      const result = yield* runHerdr(["shot", out], { env: { HERDR_DEV_CONFIG: fake.config } });
      assert.strictEqual(result.code, 1);
      assert.match(
        result.stderr,
        new RegExp(
          `^herdr: couldn't copy ann@herdr-host:\\S+/shot\\.png to ${out} \\(exit [1-9]\\d*: cp: .*No such file or directory\\)\\n$`,
        ),
      );
      assert.deepStrictEqual(readdirSync(join(fake.root, "tmp")), []);
    });
  });
});

describe("runHerdr shot, unreachable host", () => {
  it.effect("exits 1 saying the Herdr host is unreachable", () => {
    const fake = fakeHerdrHost({ unreachable: true });
    const out = join(tempDir(), "shot.png");
    return Effect.gen(function* () {
      const result = yield* runHerdr(["shot", out], { env: { HERDR_DEV_CONFIG: fake.config } });
      assert.deepStrictEqual(result, {
        code: 1,
        stdout: "",
        stderr:
          "herdr: Herdr host unreachable: ann@herdr-host:2222 " +
          "(ssh: connect to host herdr-host port 2222: Connection refused)\n",
      });
      assert.isFalse(existsSync(out));
    });
  });
});

describe("runHerdr shot --crop, no dev config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.effect(
    "shoots and crops with herdr-app and sips from PATH, and removes the temp folder",
    () => {
      const bin = join(tempDir(), "bin");
      vi.stubEnv("PATH", `${bin}:${process.env.PATH ?? ""}`);
      const appLog = join(tempDir(), "app.log");
      fakeShooter(bin, appLog);
      fakeBin(bin, "sips", `printf cropped > "$7"`);
      const out = join(tempDir(), "shot.png");
      return Effect.gen(function* () {
        const result = yield* runHerdr(["shot", out, "--crop", "0,0,10,10"], {
          env: {},
          repoRoot: tempDir(),
        });
        assert.deepStrictEqual(result, { code: 0, stdout: `saved ${out}\n`, stderr: "" });
        assert.strictEqual(textOf(out), "cropped");
        const [call = ""] = loggedLines(appLog);
        const image = call.replace(/^shot /, "");
        assert.isTrue(image.startsWith(tmpdir()));
        assert.isFalse(existsSync(dirname(image)));
      });
    },
  );
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

describe("herdr CLI, shot", () => {
  it("saves the shot at <file> and says so", () => {
    const fake = fakeHerdrHost();
    fakeShooter(fake.appBin, join(tempDir(), "app.log"));
    const out = join(tempDir(), "shot.png");
    const result = spawnSync("vpx", ["scripts/herdr.ts", "shot", out], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: { ...process.env, HERDR_DEV_CONFIG: fake.config },
      encoding: "utf8",
    });
    assert.deepStrictEqual(
      { code: result.status, stdout: result.stdout, stderr: result.stderr },
      { code: 0, stdout: `saved ${out}\n`, stderr: "" },
    );
    assert.strictEqual(textOf(out), "full window");
  });

  it("exits 2 with usage for a malformed --crop", () => {
    const fake = fakeHerdrHost();
    const result = spawnSync("vpx", ["scripts/herdr.ts", "shot", "a.png", "--crop", "1,2"], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: { ...process.env, HERDR_DEV_CONFIG: fake.config },
      encoding: "utf8",
    });
    assert.strictEqual(result.status, 2);
    assert.deepStrictEqual(loggedLines(fake.sshLog), []);
  });
});
