import { assert, describe, it } from "@effect/vitest";
import { Effect, Option, Result } from "effect";
import {
  FileError,
  FileMissing,
  Files,
  PickerFailed,
  WriteConflict,
  type FilesApi,
} from "../src/files.ts";

/**
 * A result with its error's tag and fields as a plain list, so a deep comparison checks
 * them all (chai compares Error objects by name and message only).
 */
const failureOf = <A, E>(result: Result.Result<A, E>) =>
  Result.mapError(result, (error): readonly unknown[] => {
    if (error instanceof FileMissing) return [error._tag, error.path];
    if (error instanceof FileError) return [error._tag, error.path, error.cause];
    if (error instanceof WriteConflict) return [error._tag, error.path];
    if (error instanceof PickerFailed) return [error._tag, error.cause];
    return [String(error)];
  });

/** The folder picker for fakes of tests that never open it. */
const noPicker: FilesApi["pickFolder"] = () => Promise.reject(new Error("no picker here"));

/**
 * A Herdr API over `disk` (path to text); writes are refused unless `write` is given.
 * Its `exec` runs only `rm -f -- <path>`, deleting the file from `disk`.
 */
const onDisk = (
  disk: Readonly<Record<string, string>>,
  write?: FilesApi["writeTextFile"],
): FilesApi => {
  const files: Record<string, string> = { ...disk };
  return {
    readTextFile: (path) => Promise.resolve(files[path] ?? null),
    writeTextFile: write ?? (() => Promise.reject(new Error("read-only"))),
    pickFolder: noPicker,
    exec: (command, args = []) => {
      const [force, end, path] = args;
      if (command !== "rm" || force !== "-f" || end !== "--" || path === undefined) {
        return Promise.reject(new Error(`unexpected command: ${command} ${args.join(" ")}`));
      }
      delete files[path];
      return Promise.resolve({ code: 0, stdout: "", stderr: "" });
    },
  };
};

describe("Files.read", () => {
  it.effect("the file's text", () =>
    Effect.gen(function* () {
      const files = yield* Files;
      assert.strictEqual(yield* files.read("/a.json"), "{}");
    }).pipe(Effect.provide(Files.layer(onDisk({ "/a.json": "{}" })))),
  );

  it.effect("no file is FileMissing, naming the path", () =>
    Effect.gen(function* () {
      const files = yield* Files;
      const result = yield* Effect.result(files.read("/none.json"));
      assert.deepStrictEqual(failureOf(result), Result.fail(["FileMissing", "/none.json"]));
    }).pipe(Effect.provide(Files.layer(onDisk({})))),
  );

  it.effect("a read that fails is FileError, with the path and cause", () =>
    Effect.gen(function* () {
      const files = yield* Files;
      const result = yield* Effect.result(files.read("/big.json"));
      assert.deepStrictEqual(failureOf(result), Result.fail(["FileError", "/big.json", "too big"]));
    }).pipe(
      Effect.provide(Files.layer({ ...onDisk({}), readTextFile: () => Promise.reject("too big") })),
    ),
  );
});

describe("Files.create", () => {
  it.effect("writes the text as a new file, never over one", () =>
    Effect.gen(function* () {
      const writes: unknown[] = [];
      const api = onDisk({}, (path, text, expected) => {
        writes.push([path, text, expected]);
        return Promise.resolve(null);
      });
      yield* Effect.gen(function* () {
        const files = yield* Files;
        yield* files.create("/new.json", "{}\n");
      }).pipe(Effect.provide(Files.layer(api)));
      assert.deepStrictEqual(writes, [["/new.json", "{}\n", null]]);
    }),
  );

  it.effect("a write that fails is FileError, with the path and cause", () =>
    Effect.gen(function* () {
      const files = yield* Files;
      const result = yield* Effect.result(files.create("/new.json", "{}"));
      assert.deepStrictEqual(
        failureOf(result),
        Result.fail(["FileError", "/new.json", "disk full"]),
      );
    }).pipe(Effect.provide(Files.layer(onDisk({}, () => Promise.reject("disk full"))))),
  );

  it.effect("refused because a file is there now: WriteConflict, naming the path", () =>
    Effect.gen(function* () {
      const files = yield* Files;
      const result = yield* Effect.result(files.create("/new.json", "{}"));
      assert.deepStrictEqual(failureOf(result), Result.fail(["WriteConflict", "/new.json"]));
    }).pipe(
      Effect.provide(
        Files.layer(onDisk({ "/new.json": "{ }" }, () => Promise.reject(new Error("stale")))),
      ),
    ),
  );
});

describe("Files.replace", () => {
  it.effect("writes the text over the file, expecting it as it was read", () =>
    Effect.gen(function* () {
      const writes: unknown[] = [];
      const api = onDisk({ "/a.json": "{}" }, (path, text, expected) => {
        writes.push([path, text, expected]);
        return Promise.resolve(null);
      });
      yield* Effect.gen(function* () {
        const files = yield* Files;
        yield* files.replace("/a.json", '{"depth":2}', "{}");
      }).pipe(Effect.provide(Files.layer(api)));
      assert.deepStrictEqual(writes, [["/a.json", '{"depth":2}', "{}"]]);
    }),
  );

  it.effect("refused because the file changed since it was read: WriteConflict", () =>
    Effect.gen(function* () {
      const files = yield* Files;
      const result = yield* Effect.result(files.replace("/a.json", "{}", '{"old":1}'));
      assert.deepStrictEqual(failureOf(result), Result.fail(["WriteConflict", "/a.json"]));
    }).pipe(
      Effect.provide(
        Files.layer(
          onDisk({ "/a.json": '{"edited":1}' }, () => Promise.reject(new Error("stale"))),
        ),
      ),
    ),
  );

  it.effect(
    "a write that fails with the file unchanged is FileError, with the path and cause",
    () =>
      Effect.gen(function* () {
        const files = yield* Files;
        const result = yield* Effect.result(files.replace("/a.json", "{}", '{"old":1}'));
        assert.deepStrictEqual(
          failureOf(result),
          Result.fail(["FileError", "/a.json", "disk full"]),
        );
      }).pipe(
        Effect.provide(
          Files.layer(onDisk({ "/a.json": '{"old":1}' }, () => Promise.reject("disk full"))),
        ),
      ),
  );
});

describe("Files.pickFolder", () => {
  it.effect("the folder picked, asked with the prompt; none when the picker is cancelled", () =>
    Effect.gen(function* () {
      const prompts: unknown[] = [];
      const answers = ["/Users/me/oss", null];
      const api: FilesApi = {
        ...onDisk({}),
        pickFolder: (options) => {
          prompts.push(options);
          return Promise.resolve(answers.shift() ?? null);
        },
      };
      const files = Files.layer(api);
      const picked = yield* Files.use((f) => f.pickFolder("Add group folder")).pipe(
        Effect.provide(files),
      );
      const cancelled = yield* Files.use((f) => f.pickFolder("Add group folder")).pipe(
        Effect.provide(files),
      );
      assert.deepStrictEqual(
        [picked, cancelled, prompts],
        [
          Option.some("/Users/me/oss"),
          Option.none(),
          [{ prompt: "Add group folder" }, { prompt: "Add group folder" }],
        ],
      );
    }),
  );

  it.effect("a picker that can't be shown is PickerFailed, with the cause", () =>
    Effect.gen(function* () {
      const api: FilesApi = { ...onDisk({}), pickFolder: () => Promise.reject("no window") };
      const result = yield* Effect.result(
        Files.use((f) => f.pickFolder("Add group folder")).pipe(Effect.provide(Files.layer(api))),
      );
      assert.deepStrictEqual(failureOf(result), Result.fail(["PickerFailed", "no window"]));
    }),
  );
});

describe("Files.remove", () => {
  it.effect("deletes the file, so reading it finds none", () =>
    Effect.gen(function* () {
      const files = yield* Files;
      yield* files.remove("/old.json");
      const result = yield* Effect.result(files.read("/old.json"));
      assert.deepStrictEqual(failureOf(result), Result.fail(["FileMissing", "/old.json"]));
    }).pipe(Effect.provide(Files.layer(onDisk({ "/old.json": "{}" })))),
  );

  it.effect("an rm that fails is FileError, with the path and rm's message", () =>
    Effect.gen(function* () {
      const files = yield* Files;
      const result = yield* Effect.result(files.remove("/old.json"));
      assert.deepStrictEqual(
        failureOf(result),
        Result.fail(["FileError", "/old.json", "rm: /old.json: Permission denied"]),
      );
    }).pipe(
      Effect.provide(
        Files.layer({
          ...onDisk({ "/old.json": "{}" }),
          exec: () =>
            Promise.resolve({ code: 1, stdout: "", stderr: "rm: /old.json: Permission denied\n" }),
        }),
      ),
    ),
  );
});
