import { Option, Result } from "effect";
import { describe, expect, test } from "vite-plus/test";
import {
  askRefresh,
  foldList,
  IDLE,
  NO_READS,
  onRender,
  refreshDone,
  scanDue,
} from "../src/reads.ts";
import type { Worktree } from "../src/worktrees.ts";

const wt = (path: string): Worktree => ({
  branch: Option.some(path.split("/").at(-1) ?? path),
  path,
  state: { _tag: "Active" },
  ahead: 0,
  behind: 0,
  added: 0,
  deleted: 0,
  upstream: Option.none(),
  dirty: false,
  committedAt: Option.none(),
});

const A = wt("/r/a");
const B = wt("/r/b");

describe("foldList", () => {
  test("a read that works replaces the list and clears the error", () => {
    const old = { _tag: "Read", worktrees: [A], error: Option.some("boom") } as const;
    expect(foldList(Option.some(old), Result.succeed([B]))).toEqual({
      _tag: "Read",
      worktrees: [B],
      error: Option.none(),
    });
  });

  test("a failed read keeps the worktrees from before, with the error", () => {
    const old = { _tag: "Read", worktrees: [A], error: Option.none() } as const;
    expect(foldList(Option.some(old), Result.fail("no repo"))).toEqual({
      _tag: "Read",
      worktrees: [A],
      error: Option.some("no repo"),
    });
  });

  test("a first read that fails has no worktrees", () => {
    expect(foldList(Option.none(), Result.fail("no repo")).worktrees).toEqual([]);
  });
});

describe("scanDue", () => {
  const last = { key: "k", at: 1_000 };

  test("the first scan is always due", () => {
    expect(scanDue(Option.none(), { forced: false, key: "k", now: 1_000, every: 600 })).toBe(true);
  });

  test("due when asked for", () => {
    expect(scanDue(Option.some(last), { forced: true, key: "k", now: 1_001, every: 600 })).toBe(
      true,
    );
  });

  test("due when the settings changed what to scan", () => {
    expect(scanDue(Option.some(last), { forced: false, key: "k2", now: 1_001, every: 600 })).toBe(
      true,
    );
  });

  test("due once the last scan is older than every, and not before", () => {
    expect(scanDue(Option.some(last), { forced: false, key: "k", now: 1_601, every: 600 })).toBe(
      true,
    );
    expect(scanDue(Option.some(last), { forced: false, key: "k", now: 1_600, every: 600 })).toBe(
      false,
    );
  });
});

describe("askRefresh and refreshDone", () => {
  test("an idle panel starts the refresh asked for", () => {
    expect(askRefresh(IDLE, { scan: false })).toEqual({
      loader: { _tag: "Loading", again: Option.none() },
      start: Option.some({ scan: false }),
    });
  });

  test("asks while loading make one more refresh, scanning if any of them asked to", () => {
    const first = askRefresh(IDLE, { scan: false }).loader;
    const second = askRefresh(first, { scan: true });
    const third = askRefresh(second.loader, { scan: false });
    expect(second.start).toEqual(Option.none());
    expect(third).toEqual({
      loader: { _tag: "Loading", again: Option.some({ scan: true }) },
      start: Option.none(),
    });
  });

  test("when it finishes, it goes idle and hands on the refresh asked for meanwhile", () => {
    const loading = askRefresh(askRefresh(IDLE, { scan: false }).loader, { scan: false }).loader;
    expect(refreshDone(loading)).toEqual({ loader: IDLE, again: Option.some({ scan: false }) });
    expect(refreshDone(askRefresh(IDLE, { scan: true }).loader)).toEqual({
      loader: IDLE,
      again: Option.none(),
    });
  });

  test("finishing while idle changes nothing", () => {
    expect(refreshDone(IDLE)).toEqual({ loader: IDLE, again: Option.none() });
  });
});

describe("onRender", () => {
  test("the first render while shown starts reading", () => {
    expect(onRender(NO_READS, { shown: true })).toEqual({
      reads: { started: true, wasHidden: false },
      step: "Start",
    });
  });

  test("nothing is read while hidden, and showing again reads again", () => {
    const hidden = onRender(NO_READS, { shown: false });
    expect(hidden).toEqual({ reads: { started: false, wasHidden: true }, step: "None" });
    const started = onRender(onRender(NO_READS, { shown: true }).reads, { shown: false });
    expect(started).toEqual({ reads: { started: true, wasHidden: true }, step: "None" });
    expect(onRender(started.reads, { shown: true })).toEqual({
      reads: { started: true, wasHidden: false },
      step: "Start",
    });
  });

  test("still shown, it reads nothing more", () => {
    const started = { started: true, wasHidden: false };
    expect(onRender(started, { shown: true })).toEqual({ reads: started, step: "None" });
  });
});
