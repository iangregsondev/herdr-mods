import { describe, expect, test } from "vite-plus/test";
import {
  expandHome,
  groupOf,
  missingFolders,
  OTHER,
  parseOwners,
  parseScan,
  reposFrom,
  withoutHidden,
} from "../src/repos.ts";
import { THIS_MACHINE } from "../src/machines.ts";

const HOME = "/home/me";
const HOMES = new Map([[THIS_MACHINE, HOME]]);
/** A repo on this machine. */
const here = (root: string) => ({ machine: THIS_MACHINE, root });
const folders = [
  { name: "Work", path: "~/dev/work", machine: THIS_MACHINE },
  { name: "Clients", path: "~/dev/work/clients", machine: THIS_MACHINE },
  { name: "Abs", path: "/srv/code", machine: THIS_MACHINE },
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
    expect(groupOf(here("/home/me/dev/work/api"), folders, HOMES)).toBe("Work");
    expect(groupOf(here("/srv/code/x"), folders, HOMES)).toBe("Abs");
  });

  test("the deepest group folder wins when they nest", () => {
    expect(groupOf(here("/home/me/dev/work/clients/acme"), folders, HOMES)).toBe("Clients");
  });

  test("a sibling with the same prefix is not inside", () => {
    expect(groupOf(here("/home/me/dev/workshop/x"), folders, HOMES)).toBe(OTHER);
  });

  test("a repo that is the group folder itself belongs to it", () => {
    expect(groupOf(here("/srv/code"), folders, HOMES)).toBe("Abs");
  });

  test("in no group folder: Other", () => {
    expect(groupOf(here("/tmp/x"), folders, HOMES)).toBe("Other");
    expect(groupOf(here("/tmp/x"), [], HOMES)).toBe("Other");
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

describe("missingFolders", () => {
  test("the group folders the scan printed alone on their line, missing; repo lines aren't", () => {
    expect(missingFolders("/gone\n/r\t/r/a\t3\n\n/also gone\n")).toEqual(["/gone", "/also gone"]);
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
      HOMES,
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
      [...folders, { name: "Abs", path: "/srv/code", machine: "linux" }],
      HOMES,
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

describe("groupOf across machines", () => {
  test("a group folder holds only repos on its own machine", () => {
    const box = [{ name: "Box", path: "/srv/code", machine: "linux" }];
    expect(groupOf(here("/srv/code/api"), box, HOMES)).toBe(OTHER);
    expect(groupOf({ machine: "linux", root: "/srv/code/api" }, box, HOMES)).toBe("Box");
  });
});

describe("groupOf with each machine's home", () => {
  test("~ in a group folder is its own machine's home", () => {
    const box = [{ name: "Box", path: "~/code", machine: "linux" }];
    const homes = new Map([
      [THIS_MACHINE, "/Users/me"],
      ["linux", "/home/ian"],
    ]);
    expect(groupOf({ machine: "linux", root: "/home/ian/code/api" }, box, homes)).toBe("Box");
    expect(groupOf({ machine: "linux", root: "/Users/me/code/api" }, box, homes)).toBe(OTHER);
  });

  test("a ~ folder on a machine whose home isn't known yet holds nothing", () => {
    const box = [{ name: "Box", path: "~/code", machine: "linux" }];
    const homes = new Map([[THIS_MACHINE, "/home/ian"]]);
    expect(groupOf({ machine: "linux", root: "/home/ian/code/api" }, box, homes)).toBe(OTHER);
  });
});
