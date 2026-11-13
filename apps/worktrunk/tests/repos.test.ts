import { describe, expect, test } from "vite-plus/test";
import {
  expandHome,
  groupOf,
  OTHER,
  parseOwners,
  parseScan,
  reposFrom,
  withoutHidden,
} from "../src/repos.ts";
import { THIS_MACHINE } from "../src/machines.ts";

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
    expect(parseScan("/r\t/r/a\t3\n/r\t/r/b\t1\n", THIS_MACHINE)).toEqual([
      { machine: THIS_MACHINE, root: "/r/a", count: 3 },
      { machine: THIS_MACHINE, root: "/r/b", count: 1 },
    ]);
  });

  test("a count that isn't a whole number above 0 reads as 1; bad lines are skipped", () => {
    expect(parseScan("/r\t/r/b\tx\n/r\t/r/c\t0\n\nnot a line\n", THIS_MACHINE)).toEqual([
      { machine: THIS_MACHINE, root: "/r/b", count: 1 },
      { machine: THIS_MACHINE, root: "/r/c", count: 1 },
    ]);
  });
});

describe("parseScan on a machine", () => {
  test("each repo found is on the machine the scan ran on", () => {
    expect(parseScan("/r\t/r/a\t3\n", "linux")).toEqual([
      { machine: "linux", root: "/r/a", count: 3 },
    ]);
  });
});

describe("parseOwners", () => {
  test("owner lines are repo, worktree count; a line with no tab is skipped", () => {
    expect(parseOwners("/r/a\t2\n/r/c\t\nfatal: not a repo\n", THIS_MACHINE)).toEqual([
      { machine: THIS_MACHINE, root: "/r/a", count: 2 },
      { machine: THIS_MACHINE, root: "/r/c", count: 1 },
    ]);
  });
});

describe("parseOwners on a machine", () => {
  test("each owner repo is on the machine the lookup ran on", () => {
    expect(parseOwners("/r/a\t2\n", "linux")).toEqual([
      { machine: "linux", root: "/r/a", count: 2 },
    ]);
  });
});

describe("reposFrom", () => {
  test("scanned repos and open spaces' repos, once each, with their groups, by name", () => {
    const repos = reposFrom(
      [
        { machine: THIS_MACHINE, root: "/home/me/dev/work/zeta", count: 2 },
        { machine: THIS_MACHINE, root: "/home/me/dev/work/alpha", count: 1 },
      ],
      [
        { machine: THIS_MACHINE, root: "/home/me/dev/work/alpha", count: 4 },
        { machine: THIS_MACHINE, root: "/tmp/mid", count: 1 },
      ],
      folders,
      HOME,
    );
    expect(repos).toEqual([
      { machine: THIS_MACHINE, root: "/home/me/dev/work/alpha", count: 4, group: "Work" },
      { machine: THIS_MACHINE, root: "/tmp/mid", count: 1, group: "Other" },
      { machine: THIS_MACHINE, root: "/home/me/dev/work/zeta", count: 2, group: "Work" },
    ]);
  });
});

describe("reposFrom across machines", () => {
  test("the same folder on two machines is two repos, each on its machine", () => {
    const repos = reposFrom(
      [
        { machine: THIS_MACHINE, root: "/srv/code/api", count: 2 },
        { machine: "linux", root: "/srv/code/api", count: 3 },
      ],
      [{ machine: "linux", root: "/srv/code/api", count: 4 }],
      folders,
      HOME,
    );
    expect(repos).toEqual([
      { machine: THIS_MACHINE, root: "/srv/code/api", count: 2, group: "Abs" },
      { machine: "linux", root: "/srv/code/api", count: 4, group: "Abs" },
    ]);
  });
});

describe("withoutHidden", () => {
  test("leaves out the hidden repos; the rest keep their order", () => {
    const repos = [
      { machine: THIS_MACHINE, root: "/w/b", count: 1 },
      { machine: THIS_MACHINE, root: "/w/old", count: 2 },
      { machine: THIS_MACHINE, root: "/w/a", count: 1 },
    ];
    const hidden = [
      { machine: THIS_MACHINE, root: "/w/old" },
      { machine: THIS_MACHINE, root: "/w/gone" },
    ];
    expect(withoutHidden(repos, hidden)).toEqual([
      { machine: THIS_MACHINE, root: "/w/b", count: 1 },
      { machine: THIS_MACHINE, root: "/w/a", count: 1 },
    ]);
  });
});

describe("withoutHidden across machines", () => {
  test("hides a repo only on the machine it was hidden on", () => {
    const repos = [
      { machine: THIS_MACHINE, root: "/w/old", count: 1 },
      { machine: "linux", root: "/w/old", count: 1 },
    ];
    expect(withoutHidden(repos, [{ machine: "linux", root: "/w/old" }])).toEqual([
      { machine: THIS_MACHINE, root: "/w/old", count: 1 },
    ]);
  });
});
