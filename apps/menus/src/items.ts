// Our items in Herdr's space and "+" menus: where they go among Herdr's, and what each
// asks of the worktrunk panel. Pure: no `herdr` or `gpui` imports.
import { Option } from "effect";
import { at, SPACE_ACTS, text, type MenuRequest, type SpaceAct } from "worktrunk-mailbox";

/** One item of Herdr's context menu: `[label, command, args]`. */
export type Item = readonly [string, string, Readonly<Record<string, unknown>>];

/**
 * Herdr's command for its worktree items. Ours use it too, so Herdr draws its branch
 * icon; choosing one of ours never reaches Herdr's own handling.
 */
const WORKTREE = "worktree";
/** The args key that marks an item as ours, holding what it asks for. */
const MARK = "worktrunk";

const ours = (label: string, space: string, act: SpaceAct): Item => [
  label,
  WORKTREE,
  { space, [MARK]: act },
];

/** The space a space menu's props are for; none for any other menu. */
const spaceOf = (props: unknown): Option.Option<string> =>
  at(props, "tab") === "space" ? text(at(props, "target", "id")) : Option.none();

/** Where ours go: after Herdr's last worktree item, else before its Close, else last. */
const insertAt = (list: readonly Item[]): number => {
  const lastWorktree = list.map((item) => item[1]).lastIndexOf(WORKTREE);
  if (lastWorktree >= 0) return lastWorktree + 1;
  const close = list.findIndex((item) => item[1].endsWith(".close"));
  return close >= 0 ? close : list.length;
};

/**
 * Herdr's menu `list` for `props`, with ours added when it is a space's menu and Herdr's
 * check found the space in git (`git`: "main" for a repo's main checkout, "linked" for a
 * linked worktree, null for neither or not checked yet). Every Herdr item stays, in order.
 */
export const withWorktrunkItems = (
  list: readonly Item[],
  props: unknown,
  git: unknown,
): readonly Item[] =>
  Option.match(
    Option.filter(spaceOf(props), () => git === "main" || git === "linked"),
    {
      onNone: () => list,
      onSome: (space) => {
        const added = [
          ours("Worktree (wt)…", space, "NewOrOpen"),
          ...(git === "linked"
            ? [
                ours("Merge into main (wt)…", space, "Merge"),
                ours("Remove worktree (wt)…", space, "Remove"),
              ]
            : []),
        ];
        const at = insertAt(list);
        return [...list.slice(0, at), ...added, ...list.slice(at)];
      },
    },
  );

/** What one of our items asks the worktrunk panel; none for Herdr's own items. */
export const requestOf = (item: unknown): Option.Option<MenuRequest> => {
  const args: unknown = Array.isArray(item) ? item[2] : undefined;
  return Option.map(
    Option.all({
      space: text(at(args, "space")),
      act: Option.fromNullishOr(SPACE_ACTS.find((act) => act === at(args, MARK))),
    }),
    ({ space, act }): MenuRequest => ({ _tag: "SpaceWorktree", space, act }),
  );
};

/** One row of Herdr's "+" menu, as its `row(id, icon, name, …)` helper draws it. */
export interface NewMenuRow {
  readonly id: string;
  readonly name: string;
}

/** Herdr's worktree rows: `worktree` and `worktree-open` today, or a label naming one. */
const isWorktreeRow = ({ id, name }: NewMenuRow): boolean =>
  id === WORKTREE || id.startsWith(`${WORKTREE}-`) || /\bworktree\b/i.test(name);

/**
 * The id of the "+" menu row ours goes just after: Herdr's last worktree row. None when
 * Herdr's menu has no worktree row.
 */
export const newMenuAnchor = (rows: readonly NewMenuRow[]): Option.Option<string> =>
  Option.map(Option.fromNullishOr(rows.filter(isWorktreeRow).at(-1)), (row) => row.id);
