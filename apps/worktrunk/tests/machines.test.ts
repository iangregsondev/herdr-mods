import { describe, expect, test } from "vite-plus/test";
import { repoKey, repoOfKey, THIS_MACHINE } from "../src/machines.ts";

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
