import { Option } from "effect";
import { describe, expect, test } from "vite-plus/test";
import { machineStates, repoKey, repoOfKey, statusOf, THIS_MACHINE } from "../src/machines.ts";

describe("repoKey", () => {
  test("a repo on this machine is keyed by its folder alone", () => {
    expect(repoKey({ machine: THIS_MACHINE, root: "/code/api" })).toBe("/code/api");
  });
});

describe("repoKey across machines", () => {
  test("the same folder on two machines gives two keys, neither this machine's", () => {
    const keys = [
      repoKey({ machine: THIS_MACHINE, root: "/code/api" }),
      repoKey({ machine: "linux", root: "/code/api" }),
      repoKey({ machine: "mini", root: "/code/api" }),
    ];
    expect(new Set(keys).size).toBe(3);
  });
});

describe("repoOfKey", () => {
  test("gives back the repo a key was made from, on any machine", () => {
    const repos = [
      { machine: THIS_MACHINE, root: "/code/api" },
      { machine: "linux", root: "/home/me/a:b" },
    ];
    expect(repos.map((repo) => repoOfKey(repoKey(repo)))).toEqual(repos);
  });
});

describe("statusOf", () => {
  const states = machineStates([
    { name: null, layout: "ready" },
    { name: "linux", layout: "loading" },
    { name: "mini", layout: "unavailable" },
    { name: "box", layout: "ready" },
  ]);

  test("a machine still loading is Connecting", () => {
    expect(statusOf(states, "linux")).toEqual(Option.some({ _tag: "Connecting" }));
  });

  test("an unavailable machine is Down, saying Herdr can't reach it", () => {
    expect(statusOf(states, "mini")).toEqual(
      Option.some({ _tag: "Down", reason: "Herdr can't reach it" }),
    );
  });

  test("this machine is always read, whatever its layout's state", () => {
    const starting = machineStates([{ name: null, layout: "loading" }]);
    expect(statusOf(starting, THIS_MACHINE)).toEqual(Option.none());
  });
});
