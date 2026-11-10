import { Option, Result } from "effect";
import { describe, expect, test } from "vite-plus/test";
import { parseList, type Worktree } from "../src/worktrees.ts";
import ci from "./fixtures/ci.json?raw";
import reasons from "./fixtures/reasons.json?raw";
import states from "./fixtures/states.json?raw";

// Recorded `wt list --format=json` output (paths rewritten), from throwaway repos built to
// reach every state: states.json (one repo with a remote), reasons.json (the integration
// reasons states.json can't reach) and ci.json (`--full`, with squash merges).
const FIXTURES = { ci, reasons, states };

const parsed = (name: keyof typeof FIXTURES): readonly Worktree[] =>
  Result.getOrThrow(parseList(FIXTURES[name]));

const byBranch = (name: keyof typeof FIXTURES, branch: string): Worktree => {
  const found = parsed(name).find((w) => Option.getOrUndefined(w.branch) === branch);
  if (!found) expect.fail(`no worktree for ${branch} in ${name}`);
  return found;
};

describe("parseList", () => {
  test("reads every worktree, the main checkout first", () => {
    const list = parsed("states");
    expect(list).toHaveLength(15);
    expect(list[0]?.path).toBe("/work/repo");
  });

  test("the main checkout is Main", () => {
    expect(parsed("states")[0]?.state).toEqual({ _tag: "Main" });
  });

  test("each worktree's branch; a detached worktree has none", () => {
    const list = parsed("states");
    expect(list[0]?.branch).toEqual(Option.some("main"));
    const detached = list.find((w) => w.path === "/work/repo.detached");
    expect(detached?.branch).toEqual(Option.none());
  });

  test("an integrated or empty worktree is Merged, with how it was merged", () => {
    expect(byBranch("states", "ancestor").state).toEqual({
      _tag: "Merged",
      reason: Option.some("ancestor"),
    });
    expect(byBranch("states", "emptynow").state).toEqual({
      _tag: "Merged",
      reason: Option.some("same_commit"),
    });
    expect(byBranch("states", "mergeaddsnothing").state).toEqual({
      _tag: "Merged",
      reason: Option.some("merge_adds_nothing"),
    });
    expect(byBranch("reasons", "treesmatch").state).toEqual({
      _tag: "Merged",
      reason: Option.some("trees_match"),
    });
    expect(byBranch("reasons", "noadded").state).toEqual({
      _tag: "Merged",
      reason: Option.some("no_added_changes"),
    });
    expect(byBranch("ci", "chore/dev-loop").state).toEqual({
      _tag: "Merged",
      reason: Option.some("patch_id_match"),
    });
  });

  test("a worktree that would conflict with main is Conflict", () => {
    expect(byBranch("states", "conflict").state).toEqual({ _tag: "Conflict" });
  });

  test("work not yet in main is Active, with ahead/behind main and line changes", () => {
    const ahead = byBranch("states", "aheadremote");
    expect(ahead.state).toEqual({ _tag: "Active" });
    expect(ahead).toMatchObject({ ahead: 2, behind: 5, added: 2, deleted: 0 });
  });

  test("ahead of and behind its remote branch, or none without one", () => {
    expect(byBranch("states", "main").upstream).toEqual(Option.some({ ahead: 0, behind: 0 }));
    expect(byBranch("states", "aheadremote").upstream).toEqual(
      Option.some({ ahead: 1, behind: 0 }),
    );
    expect(byBranch("states", "behindremote").upstream).toEqual(
      Option.some({ ahead: 0, behind: 1 }),
    );
    expect(byBranch("states", "ahead").upstream).toEqual(Option.none());
  });

  test("uncommitted changes of any kind make it dirty", () => {
    expect(byBranch("states", "samecommit").dirty).toBe(true); // modified
    expect(byBranch("states", "staged").dirty).toBe(true); // staged and untracked
    expect(byBranch("states", "ahead").dirty).toBe(false);
    // Dirty at main's commit is still work in progress, not merged.
    expect(byBranch("states", "samecommit").state).toEqual({ _tag: "Active" });
  });

  test("the last commit's time, in ms", () => {
    expect(byBranch("states", "main").committedAt).toEqual(
      Option.some(Date.parse("2026-11-09T15:32:31Z")),
    );
  });

  test("the bare-array shape of older wt versions", () => {
    const items: unknown = JSON.parse(FIXTURES.reasons).items;
    const paths = (list: readonly Worktree[]) => list.map((w) => w.path);
    expect(Result.map(parseList(JSON.stringify(items)), paths)).toEqual(
      Result.succeed(paths(parsed("reasons"))),
    );
  });

  test("an unborn branch (no head) and no default-branch data", () => {
    const text = JSON.stringify({
      items: [{ branch: "main", head: null, worktree: { path: "/r", main: true } }],
    });
    const [only] = Result.getOrThrow(parseList(text));
    expect(only?.committedAt).toEqual(Option.none());
    expect(only).toMatchObject({ ahead: 0, behind: 0, added: 0, deleted: 0, dirty: false });
  });

  test("items without a worktree are left out", () => {
    const text = JSON.stringify({ items: [{ branch: "only-a-branch" }] });
    expect(parseList(text)).toEqual(Result.succeed([]));
  });

  test("text that isn't wt's JSON is an error", () => {
    expect(Result.isFailure(parseList("not json"))).toBe(true);
    expect(parseList('{"items": 3}')).toEqual(Result.fail("wt list printed no list of worktrees"));
  });
});
