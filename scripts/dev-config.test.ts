// @effect/vitest marks its whole API unstable; it is the test runner the repo mandates for Effect code.
// oxlint-disable effecttsgo/unstable-api-usage
import { assert, describe, it } from "@effect/vitest";
import { Result } from "effect";
import { decodeDevConfig, DevTarget } from "./dev-config.ts";

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
