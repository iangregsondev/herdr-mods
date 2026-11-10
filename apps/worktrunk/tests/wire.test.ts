import { Option } from "effect";
import { describe, expect, test } from "vite-plus/test";
import { DEFAULT_VIEW_STATE } from "../src/view.ts";
import { readFolded, readViewState, writeViewState } from "../src/wire.ts";

describe("readFolded", () => {
  test("keeps the true and false entries only", () => {
    expect(readFolded({ "/r/app": true, "/r/app|merged": false, odd: "yes" })).toEqual({
      "/r/app": true,
      "/r/app|merged": false,
    });
  });

  test("anything but an object is nothing folded", () => {
    expect(readFolded(undefined)).toEqual({});
    expect(readFolded([true])).toEqual({});
  });
});

describe("view state", () => {
  test("defaults: All, the Repos view, only repos with worktrees", () => {
    expect(DEFAULT_VIEW_STATE).toEqual({ group: Option.none(), show: "repos", only: true });
  });

  test("survives a round trip through shared state", () => {
    const state = { group: Option.some("Work"), show: "merged", only: false } as const;
    const stored: unknown = JSON.parse(JSON.stringify(writeViewState(state)));
    expect(readViewState(stored)).toEqual(state);
    const defaults: unknown = JSON.parse(JSON.stringify(writeViewState(DEFAULT_VIEW_STATE)));
    expect(readViewState(defaults)).toEqual(DEFAULT_VIEW_STATE);
  });

  test("nothing stored, or something unreadable, gives the defaults field by field", () => {
    expect(readViewState(undefined)).toEqual(DEFAULT_VIEW_STATE);
    expect(readViewState("repos")).toEqual(DEFAULT_VIEW_STATE);
    expect(readViewState({ group: 3, show: "nope", only: "yes" })).toEqual(DEFAULT_VIEW_STATE);
    expect(readViewState({ show: "open" })).toEqual({ ...DEFAULT_VIEW_STATE, show: "open" });
  });
});
