// The version stamp a mod's shipped RECIPE.md carries: one line under its title
// heading, saying the mod version and linking the mod's changelog. The build
// (mod-pack.ts) stamps the copied recipe; the source recipe stays unstamped.

/** What the stamp line says: the mod version and where its changelog is. */
export interface RecipeStamp {
  readonly version: string;
  readonly changelogUrl: string;
}

/** The stamp line: `Version <x.y.z> · [Changelog](<link>)`. */
const stampLine = ({ version, changelogUrl }: RecipeStamp): string =>
  `Version ${version} · [Changelog](${changelogUrl})`;

/** A stamp line of any version and link. */
const STAMP_SHAPE = /^Version \S+ · \[Changelog\]\(\S+\)$/;

/** `recipe` with the stamp line under its first `# ` heading, after a blank line. */
export function stampRecipe(recipe: string, stamp: RecipeStamp): string {
  const lines = recipe.split("\n");
  const title = lines.findIndex((text) => text.startsWith("# "));
  const head = lines.slice(0, title + 1);
  const body = lines.slice(title + 1);
  // Under a title, the stamp follows a blank line; with no title it leads the
  // recipe and a blank line follows it.
  const block = title === -1 ? [stampLine(stamp), ""] : ["", stampLine(stamp)];
  // An earlier stamp block, of any version, is replaced, so a recipe never carries two.
  const earlier = body.slice(0, block.length);
  const hasEarlier =
    earlier.length === block.length &&
    earlier.every((text, i) => (block[i] === "" ? text === "" : STAMP_SHAPE.test(text)));
  return [...head, ...block, ...(hasEarlier ? body.slice(block.length) : body)].join("\n");
}
