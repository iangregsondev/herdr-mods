import { Option } from "effect";
import { describe, expect, test } from "vite-plus/test";
import { syncNotice } from "../src/sync.ts";

const record = (version: string) =>
  Option.some(JSON.stringify({ layout: "iangregsondev", from: "main", version }));

describe("syncNotice", () => {
  test("asks for a sync when the installed Herdr differs from the one the layout was built from", () => {
    expect(syncNotice(record("0.1.12"), "0.1.14", undefined)).toEqual(
      Option.some({
        title: "Herdr updated: run herdr:sync",
        body: 'Your "iangregsondev" layout was built from Herdr 0.1.12; Herdr is now 0.1.14. Run `vp run herdr:sync` in herdr-mods.',
      }),
    );
  });

  test("says nothing when the versions match", () => {
    expect(syncNotice(record("0.1.14"), "0.1.14", undefined)).toEqual(Option.none());
  });

  test("says nothing again once it has told you about this installed version", () => {
    expect(syncNotice(record("0.1.12"), "0.1.14", "0.1.14")).toEqual(Option.none());
  });

  test("tells you again when Herdr moves on past the version it last told you about", () => {
    expect(Option.isSome(syncNotice(record("0.1.12"), "0.1.15", "0.1.14"))).toBe(true);
  });

  test("says nothing when there is no record, or it can't be read", () => {
    expect(syncNotice(Option.none(), "0.1.14", undefined)).toEqual(Option.none());
    expect(syncNotice(Option.some("{ not json"), "0.1.14", undefined)).toEqual(Option.none());
    expect(syncNotice(Option.some(JSON.stringify({ layout: "x" })), "0.1.14", undefined)).toEqual(
      Option.none(),
    );
  });

  test("says nothing when the installed version is unknown", () => {
    expect(syncNotice(record("0.1.12"), "", undefined)).toEqual(Option.none());
  });
});
