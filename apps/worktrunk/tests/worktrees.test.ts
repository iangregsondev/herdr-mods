import { Option, Result } from "effect";
import { describe, expect, test } from "vite-plus/test";
import { parseList, type Worktree } from "../src/worktrees.ts";
import ciStates from "./fixtures/ci-states.json?raw";
import ci from "./fixtures/ci.json?raw";
import reasons from "./fixtures/reasons.json?raw";
import states from "./fixtures/states.json?raw";

// Recorded `wt list --format=json` output (paths rewritten), from throwaway repos built to
// reach every state: states.json (one repo with a remote), reasons.json (the integration
// reasons states.json can't reach) and ci.json (`--full`, with CI and squash merges).
// ci-states.json is ci.json's shape with the CI answers a test repo can't produce on
// demand (running, failed, stale, conflicts, undetermined, a forge error) filled in by hand.
const FIXTURES = { ci, "ci-states": ciStates, reasons, states };

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

  test("CI: passed checks, on the branch or its PR", () => {
    expect(byBranch("ci", "main").ci).toEqual({ _tag: "Checks", status: "passed", stale: false });
    expect(byBranch("ci", "feat/5-worktrunk-mod").ci).toEqual({
      _tag: "Checks",
      status: "passed",
      stale: false,
    });
  });

  test("CI: running and failed checks", () => {
    expect(byBranch("ci-states", "running").ci).toEqual({
      _tag: "Checks",
      status: "running",
      stale: false,
    });
    expect(byBranch("ci-states", "failed").ci).toEqual({
      _tag: "Checks",
      status: "failed",
      stale: false,
    });
  });

  test("CI: checks for an older commit than the one pushed are stale", () => {
    expect(byBranch("ci-states", "stale").ci).toEqual({
      _tag: "Checks",
      status: "passed",
      stale: true,
    });
  });

  test("CI: a PR the forge says conflicts", () => {
    expect(byBranch("ci-states", "conflicts").ci).toEqual({ _tag: "Conflicts" });
  });

  test("CI: asked, but the forge gave no answer", () => {
    expect(byBranch("ci-states", "undetermined").ci).toEqual({ _tag: "Unknown" });
    expect(byBranch("ci-states", "error").ci).toEqual({ _tag: "Unknown" });
  });

  test("CI: asked, and there is no PR and no checks", () => {
    expect(byBranch("ci", "feat/6-namespace").ci).toEqual({ _tag: "None" });
    expect(byBranch("ci-states", "nopr").ci).toEqual({ _tag: "None" });
  });

  test("CI: not asked when wt list ran without --full", () => {
    expect(byBranch("states", "main").ci).toEqual({ _tag: "NotAsked" });
    const items: unknown = JSON.parse(FIXTURES.ci).items;
    const [first] = Result.getOrThrow(parseList(JSON.stringify(items)));
    expect(first?.ci).toEqual({ _tag: "NotAsked" });
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
