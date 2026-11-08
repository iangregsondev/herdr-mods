import { expect, test } from "vite-plus/test";
import { greeting } from "../src/greeting.ts";

test("no spaces", () => {
  expect(greeting(0)).toBe("Hello! No spaces open.");
});

test("one space", () => {
  expect(greeting(1)).toBe("Hello! 1 space open.");
});

test("many spaces", () => {
  expect(greeting(3)).toBe("Hello! 3 spaces open.");
});
