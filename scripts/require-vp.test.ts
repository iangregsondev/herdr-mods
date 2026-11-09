import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { linkTools, runSh, tempDir } from "./test-support.ts";

const script = join(import.meta.dirname, "require-vp.sh");

/** A PATH holding only `sh`: the script needs nothing else. */
function shOnlyPath(): string {
  const bin = join(tempDir(), "bin");
  linkTools(bin, ["sh"]);
  return bin;
}

describe("require-vp.sh", () => {
  test("allows an install run through vp", () => {
    const result = runSh(script, { env: { PATH: shOnlyPath(), VP_PATH_INJECTED_TOOLS: "pnpm" } });
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
  });

  test.each([
    ["unset", undefined],
    ["empty", ""],
  ])("refuses an install when VP_PATH_INJECTED_TOOLS is %s", (_label, value) => {
    const result = runSh(script, { env: { PATH: shOnlyPath(), VP_PATH_INJECTED_TOOLS: value } });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("vp install");
  });
});
