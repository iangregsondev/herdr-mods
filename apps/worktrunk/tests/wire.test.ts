import { describe, expect, test } from "vite-plus/test";
import { readFolded } from "../src/wire.ts";

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
