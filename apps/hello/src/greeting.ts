// Pure logic: no `herdr` or `gpui-kit` imports, so tests can load it outside the app.

export function greeting(spaceCount: number): string {
  if (spaceCount === 0) return "Hello! No spaces open.";
  return `Hello! ${spaceCount} space${spaceCount === 1 ? "" : "s"} open.`;
}
