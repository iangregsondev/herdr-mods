import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, Result } from "effect";
import { Files, type FilesApi } from "worktrunk-mailbox";
import { loadCopy, Modules } from "../src/copies.ts";
import { patchedSource, wrapFor } from "../src/wraps.ts";

const SELF = "iangregsondev-menus";
const HOME = "/app";
/** Herdr's tab bar, as far as its patch point goes. */
const TABS = 'openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })';
const PATCHED_TABS = Result.getOrThrow(patchedSource(wrapFor("tabs", SELF), TABS));
const COPY = `${HOME}/mods/${SELF}/.herdr-tabs.js`;

/** The folder picker for fakes of tests that never open it. */
const noPicker: FilesApi["pickFolder"] = () => Promise.reject(new Error("no picker here"));

/** `exec` for fakes of tests that never delete a file. */
const noExec: FilesApi["exec"] = () => Promise.reject(new Error("exec isn't called here"));

/** A Herdr API over `files` (path to text) that records every write. */
const disk = (files: Readonly<Record<string, string>>) => {
  const writes: unknown[] = [];
  const api: FilesApi = {
    readTextFile: (path) => Promise.resolve(files[path] ?? null),
    writeTextFile: (path, text, expected) => {
      writes.push([path, text, expected]);
      return Promise.resolve(null);
    },
    pickFolder: noPicker,
    exec: noExec,
  };
  return { api, writes };
};

/** A module loader that records what it loads and gives back `exports`. */
const modules = (exports: unknown) => {
  const loaded: string[] = [];
  const load = (file: string) => {
    loaded.push(file);
    return Promise.resolve(exports);
  };
  return { layer: Modules.layer(load), loaded };
};

/** A class standing in for the default export of Herdr's mod. */
class View {}

describe("loadCopy", () => {
  it.effect("copies Herdr's file, patched, into this mod's folder, and imports the copy", () =>
    Effect.gen(function* () {
      const { api, writes } = disk({ [`${HOME}/mods/tabs/main.js`]: TABS });
      const { layer, loaded } = modules({ default: View });
      const copy = yield* loadCopy("tabs", HOME, SELF).pipe(
        Effect.provide(Layer.merge(Files.layer(api), layer)),
      );
      assert.deepStrictEqual(
        [copy, writes, loaded],
        [
          Result.succeed({ exports: { default: View }, misses: [] }),
          [[COPY, PATCHED_TABS, null]],
          [".herdr-tabs.js"],
        ],
      );
    }),
  );

  it.effect("a copy that already holds the text isn't written again", () =>
    Effect.gen(function* () {
      const { api, writes } = disk({ [`${HOME}/mods/tabs/main.js`]: TABS, [COPY]: PATCHED_TABS });
      const { layer } = modules({ default: View });
      const copy = yield* loadCopy("tabs", HOME, SELF).pipe(
        Effect.provide(Layer.merge(Files.layer(api), layer)),
      );
      assert.deepStrictEqual([Result.isSuccess(copy), writes], [true, []]);
    }),
  );

  it.effect("a copy made from an older Herdr is replaced, over the text it held", () =>
    Effect.gen(function* () {
      const { api, writes } = disk({ [`${HOME}/mods/tabs/main.js`]: TABS, [COPY]: "// older" });
      const { layer } = modules({ default: View });
      yield* loadCopy("tabs", HOME, SELF).pipe(
        Effect.provide(Layer.merge(Files.layer(api), layer)),
      );
      assert.deepStrictEqual(writes, [[COPY, PATCHED_TABS, "// older"]]);
    }),
  );

  it.effect("when a patch point misses, the copy is Herdr's file unchanged, and says which", () =>
    Effect.gen(function* () {
      const moved = TABS.replace("height: 512", "height: 520");
      const { api, writes } = disk({ [`${HOME}/mods/tabs/main.js`]: moved });
      const { layer } = modules({ default: View });
      const copy = yield* loadCopy("tabs", HOME, SELF).pipe(
        Effect.provide(Layer.merge(Files.layer(api), layer)),
      );
      assert.deepStrictEqual(
        [copy, writes],
        [
          Result.succeed({
            exports: { default: View },
            misses: [{ name: 'tabs: "+" button opens new-menu', found: 0 }],
          }),
          [[COPY, moved, null]],
        ],
      );
    }),
  );

  /** What loadCopy gives for `role` over `api` and the module loader `loader`. */
  const loaded = (api: FilesApi, loader = modules({ default: View }).layer) =>
    loadCopy("tabs", HOME, SELF).pipe(Effect.provide(Layer.merge(Files.layer(api), loader)));

  it.effect("with Herdr's mod not installed, says so, and writes nothing", () =>
    Effect.gen(function* () {
      const { api, writes } = disk({});
      const copy = yield* loaded(api);
      assert.deepStrictEqual([copy, writes], [Result.fail("Herdr's tabs mod isn't installed"), []]);
    }),
  );

  it.effect("a copy that can't be imported is the import's reason, naming the file", () =>
    Effect.gen(function* () {
      const { api } = disk({ [`${HOME}/mods/tabs/main.js`]: TABS });
      const refusing = Modules.layer(() => Promise.reject(new Error("SyntaxError: bad token")));
      const copy = yield* loaded(api, refusing);
      assert.deepStrictEqual(
        copy,
        Result.fail("couldn't load .herdr-tabs.js: SyntaxError: bad token"),
      );
    }),
  );

  it.effect.each([
    ["no default export", { other: View }],
    ["a default export that isn't a class", { default: "View" }],
    ["no module at all", undefined],
  ])("a copy with %s says it has no view to show", ([_label, exports]) =>
    Effect.gen(function* () {
      const { api } = disk({ [`${HOME}/mods/tabs/main.js`]: TABS });
      const copy = yield* loaded(api, modules(exports).layer);
      assert.deepStrictEqual(copy, Result.fail("Herdr's tabs has no default export to show"));
    }),
  );

  it.effect("a copy that can't be written is the write's reason, naming the file", () =>
    Effect.gen(function* () {
      const { api } = disk({ [`${HOME}/mods/tabs/main.js`]: TABS });
      const refusing: FilesApi = { ...api, writeTextFile: () => Promise.reject("EROFS") };
      const copy = yield* loaded(refusing);
      assert.deepStrictEqual(copy, Result.fail(`couldn't write ${COPY}: EROFS`));
    }),
  );

  it.effect("Herdr's file that can't be read is the read's reason, naming it", () =>
    Effect.gen(function* () {
      const { api } = disk({});
      const unreadable: FilesApi = { ...api, readTextFile: () => Promise.reject("EACCES") };
      const copy = yield* loaded(unreadable);
      assert.deepStrictEqual(copy, Result.fail(`couldn't read ${HOME}/mods/tabs/main.js: EACCES`));
    }),
  );

  it.effect("a copy changed by someone else while it was written says so", () =>
    Effect.gen(function* () {
      // The copy holds an older text when read, and another text once the write is refused.
      const reads = { count: 0 };
      const api: FilesApi = {
        readTextFile: (path) => {
          if (path !== COPY) return Promise.resolve(TABS);
          reads.count += 1;
          return Promise.resolve(reads.count === 1 ? "// older" : "// someone else's");
        },
        writeTextFile: () => Promise.reject(new Error("expected text differs")),
        pickFolder: noPicker,
        exec: noExec,
      };
      const copy = yield* loaded(api);
      assert.deepStrictEqual(copy, Result.fail(`${COPY} changed while it was written; try again`));
    }),
  );
});
