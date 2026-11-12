import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { assert, describe, it } from "@effect/vitest";
import { Effect, Result } from "effect";
import { decodeDevConfig, describeDevTarget, DevTarget, loadDevTarget } from "./dev-config.ts";
import { tempDir, writeFile } from "./test-support.ts";

const file = "herdr-dev.json";
const localHome = "/home/dev/.config/herdr-app";

describe("decodeDevConfig", () => {
  it("decodes an empty object to local, with the local Herdr home", () => {
    assert.deepStrictEqual(
      decodeDevConfig("{}", { file, localHome }),
      Result.succeed(DevTarget.Local({ herdrHome: localHome, file, found: true })),
    );
  });

  it("decodes a remote config, filling in the port, Herdr home and herdr-app defaults", () => {
    const text = JSON.stringify({ target: "remote", remote: { host: "herdr-host", user: "dev" } });
    assert.deepStrictEqual(
      decodeDevConfig(text, { file, localHome }),
      Result.succeed(
        DevTarget.Remote({
          host: "herdr-host",
          user: "dev",
          port: 22,
          herdrHome: "~/.config/herdr-app",
          herdrApp: "~/.local/bin/herdr-app",
          file,
        }),
      ),
    );
  });

  const remote = { host: "herdr-host", user: "dev" };
  it.each([
    ["an unknown target", { target: "remot" }, "target"],
    ["a remote target with no remote block", { target: "remote" }, "remote"],
    ["a missing host", { target: "remote", remote: { user: "dev" } }, "remote.host"],
    ["an empty host", { target: "remote", remote: { ...remote, host: "" } }, "remote.host"],
    ["a missing user", { target: "remote", remote: { host: "herdr-host" } }, "remote.user"],
    [
      "a port that isn't a number",
      { target: "remote", remote: { ...remote, port: "22" } },
      "remote.port",
    ],
    ["a fractional port", { target: "remote", remote: { ...remote, port: 22.5 } }, "remote.port"],
    [
      "a port out of range",
      { target: "remote", remote: { ...remote, port: 70000 } },
      "remote.port",
    ],
    [
      "an empty herdrHome",
      { target: "remote", remote: { ...remote, herdrHome: "" } },
      "remote.herdrHome",
    ],
    [
      "a herdrApp that isn't a string",
      { target: "remote", remote: { ...remote, herdrApp: 1 } },
      "remote.herdrApp",
    ],
    [
      "a password field",
      { target: "remote", remote: { ...remote, password: "x" } },
      "remote.password",
    ],
    ["an unknown top-level field", { target: "local", hots: "x" }, "hots"],
  ])("rejects %s with a DevConfigInvalid naming the field", (_label, config, field) => {
    const result = decodeDevConfig(JSON.stringify(config), { file, localHome });
    assert.isTrue(Result.isFailure(result));
    const error = Result.isFailure(result) ? result.failure : undefined;
    assert.strictEqual(error?._tag, "DevConfigInvalid");
    assert.strictEqual(error?.field, field);
    assert.strictEqual(error?.file, file);
  });

  it.each([
    ["text that isn't JSON", "{ target: remote"],
    ["JSON that isn't an object", "[]"],
  ])("rejects %s with a DevConfigInvalid for the whole file", (_label, text) => {
    const result = decodeDevConfig(text, { file, localHome });
    const error = Result.isFailure(result) ? result.failure : undefined;
    assert.strictEqual(error?._tag, "DevConfigInvalid");
    assert.strictEqual(error?.field, "(whole file)");
  });
});

describe("loadDevTarget", () => {
  it.effect("decodes the committed herdr-dev.example.json to a remote target", () =>
    Effect.gen(function* () {
      const example = fileURLToPath(new URL("../herdr-dev.example.json", import.meta.url));
      const target = yield* loadDevTarget({ env: { HERDR_DEV_CONFIG: example } });
      assert.strictEqual(target._tag, "Remote");
    }),
  );

  it.effect("reads the file HERDR_DEV_CONFIG points at", () =>
    Effect.gen(function* () {
      const dir = tempDir();
      const path = writeFile(
        dir,
        "other.json",
        JSON.stringify({
          target: "remote",
          remote: { host: "herdr-host", user: "dev", port: 2222 },
        }),
      );
      const target = yield* loadDevTarget({ env: { HERDR_DEV_CONFIG: path }, repoRoot: dir });
      assert.deepStrictEqual(
        target,
        DevTarget.Remote({
          host: "herdr-host",
          user: "dev",
          port: 2222,
          herdrHome: "~/.config/herdr-app",
          herdrApp: "~/.local/bin/herdr-app",
          file: path,
        }),
      );
    }),
  );

  it.effect("treats no file as local, with the Herdr home from HERDR_APP_HOME", () =>
    Effect.gen(function* () {
      const dir = tempDir();
      const result = yield* Effect.result(
        loadDevTarget({ env: { HERDR_APP_HOME: "/apps/herdr" }, repoRoot: dir }),
      );
      assert.deepStrictEqual(
        result,
        Result.succeed(
          DevTarget.Local({ herdrHome: "/apps/herdr", file: "herdr-dev.json", found: false }),
        ),
      );
    }),
  );

  it.effect(
    "treats no file as local, with the default Herdr home when HERDR_APP_HOME is unset",
    () =>
      Effect.gen(function* () {
        const target = yield* loadDevTarget({ env: {}, repoRoot: tempDir() });
        assert.deepStrictEqual(
          target,
          DevTarget.Local({
            herdrHome: join(homedir(), ".config", "herdr-app"),
            file: "herdr-dev.json",
            found: false,
          }),
        );
      }),
  );

  it.effect("reads a local target from the file, with the Herdr home from HERDR_APP_HOME", () =>
    Effect.gen(function* () {
      const dir = tempDir();
      writeFile(dir, "herdr-dev.json", JSON.stringify({ target: "local" }));
      const target = yield* loadDevTarget({
        env: { HERDR_APP_HOME: "/apps/herdr" },
        repoRoot: dir,
      });
      assert.deepStrictEqual(
        target,
        DevTarget.Local({ herdrHome: "/apps/herdr", file: "herdr-dev.json", found: true }),
      );
    }),
  );

  it.effect("fails with DevConfigInvalid for an invalid file, never falling back to local", () =>
    Effect.gen(function* () {
      const dir = tempDir();
      writeFile(dir, "herdr-dev.json", JSON.stringify({ target: "remote", remote: { host: "h" } }));
      const error = yield* Effect.flip(loadDevTarget({ env: {}, repoRoot: dir }));
      assert.strictEqual(error._tag, "DevConfigInvalid");
      assert.strictEqual(error._tag === "DevConfigInvalid" ? error.field : "", "remote.user");
    }),
  );

  it.effect("fails with DevConfigUnreadable when the path can't be read as a file", () =>
    Effect.gen(function* () {
      const dir = tempDir();
      mkdirSync(join(dir, "herdr-dev.json"));
      const error = yield* Effect.flip(loadDevTarget({ env: {}, repoRoot: dir }));
      assert.strictEqual(error._tag, "DevConfigUnreadable");
      assert.strictEqual(error.file, "herdr-dev.json");
    }),
  );

  it.effect("reads HERDR_DEV_CONFIG instead of the repo root's file", () =>
    Effect.gen(function* () {
      const dir = tempDir();
      writeFile(
        dir,
        "herdr-dev.json",
        JSON.stringify({ target: "remote", remote: { host: "h", user: "u" } }),
      );
      const other = writeFile(dir, "other.json", JSON.stringify({ target: "local" }));
      const target = yield* loadDevTarget({
        env: { HERDR_DEV_CONFIG: other, HERDR_APP_HOME: "/apps/herdr" },
        repoRoot: dir,
      });
      assert.deepStrictEqual(
        target,
        DevTarget.Local({ herdrHome: "/apps/herdr", file: other, found: true }),
      );
    }),
  );
  it.effect(
    "fails with DevConfigUnreadable naming the path when HERDR_DEV_CONFIG names no file",
    () =>
      Effect.gen(function* () {
        const missing = join(tempDir(), "typo.json");
        const result = yield* Effect.result(
          loadDevTarget({ env: { HERDR_DEV_CONFIG: missing }, repoRoot: tempDir() }),
        );
        const error = Result.isFailure(result) ? result.failure : undefined;
        assert.strictEqual(error?._tag, "DevConfigUnreadable");
        assert.strictEqual(error?.file, missing);
      }),
  );
});

describe("describeDevTarget", () => {
  it("says local with no file when there is no config file", () => {
    const target = DevTarget.Local({ herdrHome: localHome, file, found: false });
    assert.strictEqual(describeDevTarget(target), "target: local (no herdr-dev.json)");
  });

  it("names the file when a local target comes from it", () => {
    const target = DevTarget.Local({ herdrHome: localHome, file, found: true });
    assert.strictEqual(describeDevTarget(target), "target: local (herdr-dev.json)");
  });

  it("names the user, host and port of a remote target, and its file", () => {
    const target = DevTarget.Remote({
      host: "herdr-host",
      user: "dev",
      port: 2222,
      herdrHome: "~/.config/herdr-app",
      herdrApp: "~/.local/bin/herdr-app",
      file,
    });
    assert.strictEqual(
      describeDevTarget(target),
      "target: remote dev@herdr-host:2222 (herdr-dev.json)",
    );
  });
});
