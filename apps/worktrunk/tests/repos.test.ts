import { describe, expect, test } from "vite-plus/test";
import { expandHome, groupOf, OTHER, parseOwners, parseScan, reposFrom } from "../src/repos.ts";

const HOME = "/home/me";
const folders = [
  { name: "Work", path: "~/dev/work" },
  { name: "Clients", path: "~/dev/work/clients" },
  { name: "Abs", path: "/srv/code" },
];

describe("expandHome", () => {
  test("expands a leading ~ only", () => {
    expect(expandHome("~", HOME)).toBe(HOME);
    expect(expandHome("~/a", HOME)).toBe("/home/me/a");
    expect(expandHome("/a/~", HOME)).toBe("/a/~");
  });
});

describe("groupOf", () => {
  test("the group folder that holds the repo", () => {
    expect(groupOf("/home/me/dev/work/api", folders, HOME)).toBe("Work");
    expect(groupOf("/srv/code/x", folders, HOME)).toBe("Abs");
  });

  test("the deepest group folder wins when they nest", () => {
    expect(groupOf("/home/me/dev/work/clients/acme", folders, HOME)).toBe("Clients");
  });

  test("a sibling with the same prefix is not inside", () => {
    expect(groupOf("/home/me/dev/workshop/x", folders, HOME)).toBe(OTHER);
  });

  test("a repo that is the group folder itself belongs to it", () => {
    expect(groupOf("/srv/code", folders, HOME)).toBe("Abs");
  });

  test("in no group folder: Other", () => {
    expect(groupOf("/tmp/x", folders, HOME)).toBe("Other");
    expect(groupOf("/tmp/x", [], HOME)).toBe("Other");
  });
});

describe("parseScan", () => {
  test("scan lines are group folder, repo, worktree count", () => {
    expect(parseScan("/r\t/r/a\t3\n/r\t/r/b\t1\n")).toEqual([
      { root: "/r/a", count: 3 },
      { root: "/r/b", count: 1 },
    ]);
  });

  test("a count that isn't a whole number above 0 reads as 1; bad lines are skipped", () => {
    expect(parseScan("/r\t/r/b\tx\n/r\t/r/c\t0\n\nnot a line\n")).toEqual([
      { root: "/r/b", count: 1 },
      { root: "/r/c", count: 1 },
    ]);
  });
});

describe("parseOwners", () => {
  test("owner lines are repo, worktree count; a line with no tab is skipped", () => {
    expect(parseOwners("/r/a\t2\n/r/c\t\nfatal: not a repo\n")).toEqual([
      { root: "/r/a", count: 2 },
      { root: "/r/c", count: 1 },
    ]);
  });
});

describe("reposFrom", () => {
  test("scanned repos and open spaces' repos, once each, with their groups, by name", () => {
    const repos = reposFrom(
      [
        { root: "/home/me/dev/work/zeta", count: 2 },
        { root: "/home/me/dev/work/alpha", count: 1 },
      ],
      [
        { root: "/home/me/dev/work/alpha", count: 4 },
        { root: "/tmp/mid", count: 1 },
      ],
      folders,
      HOME,
    );
    expect(repos).toEqual([
      { root: "/home/me/dev/work/alpha", count: 4, group: "Work" },
      { root: "/tmp/mid", count: 1, group: "Other" },
      { root: "/home/me/dev/work/zeta", count: 2, group: "Work" },
    ]);
  });
});
