import { copyFileSync, existsSync, lstatSync, mkdirSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { runSh, tempDir, toolPath, writeFile } from "./test-support.ts";

const realScript = join(import.meta.dirname, "link-herdr-types.sh");
const typeFiles = ["herdr.d.ts", "gpui-kit.d.ts"] as const;

/**
 * A throwaway repo holding a copy of the script, since the script writes into
 * `<its folder>/../.herdr-types` and must never touch this repo.
 */
function fakeRepo(root: string): { script: string; dest: string; path: string } {
  const bin = toolPath(root, ["sh", "dirname", "mkdir", "ln"]);
  const scripts = join(root, "repo", "scripts");
  mkdirSync(scripts, { recursive: true });
  const script = join(scripts, "link-herdr-types.sh");
  copyFileSync(realScript, script);
  return { script, dest: join(root, "repo", ".herdr-types"), path: bin };
}

/** An app folder holding the named type files. */
function fakeApp(dir: string, files: readonly string[]): string {
  mkdirSync(dir, { recursive: true });
  files.forEach((file) => writeFile(dir, file, `// ${file}\n`));
  return dir;
}

function expectLinked(dest: string, app: string): void {
  typeFiles.forEach((file) => {
    const link = join(dest, file);
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readlinkSync(link)).toBe(join(app, file));
  });
}

describe("link-herdr-types.sh", () => {
  test.each([
    ["no type files", []],
    ["only herdr.d.ts", ["herdr.d.ts"]],
    ["only gpui-kit.d.ts", ["gpui-kit.d.ts"]],
  ])("warns and skips when the app has %s", (_label, files) => {
    const root = tempDir();
    const { script, dest, path } = fakeRepo(root);
    const app = fakeApp(join(root, "app"), files);

    const result = runSh(script, { env: { PATH: path, HERDR_APP_HOME: app } });

    expect(result.code).toBe(0);
    expect(result.stderr).toContain("no Herdr app types");
    expect(existsSync(dest)).toBe(false);
  });

  test("links both type files into .herdr-types", () => {
    const root = tempDir();
    const { script, dest, path } = fakeRepo(root);
    const app = fakeApp(join(root, "app"), typeFiles);

    const result = runSh(script, { env: { PATH: path, HERDR_APP_HOME: app } });

    expect(result.code).toBe(0);
    expectLinked(dest, app);
  });

  test("a second run repoints the links at the current app", () => {
    const root = tempDir();
    const { script, dest, path } = fakeRepo(root);
    const first = fakeApp(join(root, "app1"), typeFiles);
    const second = fakeApp(join(root, "app2"), typeFiles);

    expect(runSh(script, { env: { PATH: path, HERDR_APP_HOME: first } }).code).toBe(0);
    const result = runSh(script, { env: { PATH: path, HERDR_APP_HOME: second } });

    expect(result.code).toBe(0);
    expectLinked(dest, second);
  });

  test("falls back to $HOME/.config/herdr-app when HERDR_APP_HOME is unset", () => {
    const root = tempDir();
    const { script, dest, path } = fakeRepo(root);
    const home = join(root, "home");
    const app = fakeApp(join(home, ".config", "herdr-app"), typeFiles);

    const result = runSh(script, { env: { PATH: path, HERDR_APP_HOME: undefined, HOME: home } });

    expect(result.code).toBe(0);
    expectLinked(dest, app);
  });
});
