import { describe, expect, test } from "vite-plus/test";
import { scanArgs, shArgs } from "../src/commands.ts";

describe("scanArgs", () => {
  test("depth, skip names wrapped in slashes, then the expanded group folders", () => {
    const settings = {
      folders: [
        { name: "Work", path: "~/work" },
        { name: "Abs", path: "/srv" },
      ],
      depth: 3,
      skip: ["node_modules", ".cache"],
    };
    expect(scanArgs(settings, "/home/me")).toEqual([
      "3",
      "/node_modules//.cache/",
      "/home/me/work",
      "/srv",
    ]);
  });
});

describe("shArgs", () => {
  test("arguments follow the script and its name, never inside the script", () => {
    const [flag, script, name, ...rest] = shArgs('echo "$1"', ["it's"]);
    expect([flag, name, rest]).toEqual(["-c", "worktrunk", ["it's"]]);
    expect(script).toMatch(/echo "\$1"$/);
  });
});
