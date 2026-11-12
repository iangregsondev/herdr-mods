import { describe, expect, test } from "vite-plus/test";
import { DEFAULT_SETTINGS } from "../src/settings.ts";
import { Option } from "effect";
import {
  JOB_SCRIPT,
  jobArgs,
  quote,
  scanArgs,
  shArgs,
  startedAddress,
  switchedTo,
  waitResult,
} from "../src/commands.ts";

describe("scanArgs", () => {
  test("depth, skip names wrapped in slashes, then the expanded group folders", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      folders: [
        { name: "Work", path: "~/work" },
        { name: "Abs", path: "/srv" },
      ],
      depth: 3,
      skip: ["node_modules", ".cache"],
    };
    expect(scanArgs(settings, "/home/me")).toEqual([
      "3",
      "/node_modules//.cache/",
      "/home/me/work",
      "/srv",
    ]);
  });
});

describe("shArgs", () => {
  test("arguments follow the script and its name, never inside the script", () => {
    const [flag, script, name, ...rest] = shArgs('echo "$1"', ["it's"]);
    expect([flag, name, rest]).toEqual(["-c", "worktrunk", ["it's"]]);
    expect(script).toMatch(/echo "\$1"$/);
  });
});

describe("quote", () => {
  test("wraps a word in single quotes, so the shell reads it as one literal word", () => {
    expect(quote("feat/x")).toBe("'feat/x'");
  });

  test("a single quote inside closes the quotes, is escaped, and reopens them", () => {
    expect(quote("it's")).toBe("'it'\\''s'");
  });
});

describe("jobArgs", () => {
  test("starts the job wrapper as a background terminal in the folder, printing JSON", () => {
    expect(jobArgs({ cwd: "/r/app", shell: "/bin/zsh", body: "wt list" })).toEqual([
      "run",
      "--json",
      "--bg",
      "--no-parent",
      "--cwd",
      "/r/app",
      "--",
      "sh",
      "-c",
      JOB_SCRIPT,
      "worktrunk",
      "/bin/zsh",
      "wt list",
    ]);
  });
});

describe("reading hc's and wt's answers", () => {
  test("a started job's terminal address", () => {
    const out = '{"address":"t4g","agent":"sh","cwd":"/r","state":"live","turn":0}';
    expect(startedAddress(out)).toEqual(Option.some("t4g"));
  });

  test("hc printing anything but JSON with an address started no job", () => {
    expect(startedAddress("oops")).toEqual(Option.none());
    expect(startedAddress('{"agent":"sh"}')).toEqual(Option.none());
  });

  test("a wait that saw the job end gives its exit code", () => {
    const ended = '{"children":[],"ended":true,"exit_code":3,"reason":"exit","terminal":"t4g"}';
    expect(waitResult(ended)).toEqual({ _tag: "Ended", code: 3 });
  });

  test("a job ended by a signal has no exit code and counts as failed", () => {
    const killed = '{"ended":true,"exit_code":null,"reason":"signal","signal":"SIGHUP"}';
    expect(waitResult(killed)).toEqual({ _tag: "Ended", code: 1 });
  });

  test("a wait that timed out with the job running says so", () => {
    expect(waitResult('{"ended":false,"terminal":"t4g"}')).toEqual({ _tag: "Running" });
  });

  test("a wait with no answer it can read has lost the job", () => {
    expect(waitResult("no such terminal")).toEqual({ _tag: "Lost" });
    expect(waitResult("[1]")).toEqual({ _tag: "Lost" });
  });

  test("wt switch's answer: the worktree's branch and folder", () => {
    const out =
      '{"action":"created","branch":"feat-x","path":"/r/app.feat-x","created_branch":true}';
    expect(switchedTo(out)).toEqual(Option.some({ branch: "feat-x", path: "/r/app.feat-x" }));
  });

  test("no answer, or one without a branch and folder, switched to nothing", () => {
    expect(switchedTo("")).toEqual(Option.none());
    expect(switchedTo('{"branch":"feat-x"}')).toEqual(Option.none());
  });
});
