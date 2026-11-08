# herdr-mods

Mods and layouts for the Herdr app (GUI, `~/.config/herdr-app`). Not the Herdr TUI and its `herdr-plugin.toml` plugins.

@docs/structure.md

## Herdr app

- `~/.config/herdr-app/AGENTS.md` is the source of truth for mods, layouts, keys and the `herdr` API. The app rewrites it to match the installed version. Read it before writing mod code.
- Check every built mod with `vp run check:mods` (`herdr-app check` on each `mods/<name>/`). A mod isn't done without a pass.
- Never hand-edit `mods/`. It is build output: edit `apps/<name>/` and run `vp run -r build`, and commit `mods/` with the source change.
- To see a mod running, use the dev loop (`docs/develop.md`): `vp run <name>#dev` builds into the Herdr app and Herdr reloads on save. Prove a change with `herdr-app shot`, and remove the dev build with `vp run dev:remove <name>` when done. Never symlink a mod into Herdr: it doesn't hot-reload.
- Every mod ships `assets/RECIPE.md` and `assets/preview.png` (`.claude/rules/mod-sharing.md`).

## Git and GitHub — IMPORTANT

- **Never commit or push to `main`.** Branch as `<type>/<issue>-<short-description>` (issue number left out when there's none), created as a worktree with `wt`. Agent-only local branches, `research/<slug>` and `prototype/<slug>` are exempt.
- Commits and PR titles follow Conventional Commits (`fix(hello): handle no spaces`), with a `Refs #123` footer when there's an issue. The PR title becomes the squash commit on `main`.
- Issues use the `.github/ISSUE_TEMPLATE/` templates, every section filled (`None` where empty). Issues made by skills (`/to-spec`, `/to-tickets`, `/triage`, wayfinder) use the skill's own format.
- **Feature**, **Task** and **Idea** are issues waiting to be picked up. Feature (issue type) is new behaviour to build, Task (issue type) is a chore (tooling, docs, upkeep), and Idea (`idea` label, since personal repos can't add custom types) is a maybe. When the user names some (`/grill-with-docs #23 #25`), read them as the starting brief and list them in the grill record. `/to-spec` links each from the spec issue, then closes it with a comment naming the spec. An Idea set aside is closed as not planned, with the reason.
- Write issue and PR bodies to `.scratch/<name>.md` and pass `--body-file`. Write PR bodies with the `pr` skill, and add the template's **Related issues** section (`Closes #123` for completed issues).
- This repo is public: no local paths, hostnames or machine details in issues, PRs or commits.
- Never merge PRs. The user merges.

## Package management: always `vp`

Never run `pnpm`, `npm`, `npx`, `pnpx`, `yarn` or `bun`. A hook blocks them.

| Instead of                | Use                                                       |
| ------------------------- | --------------------------------------------------------- |
| `pnpm install`            | `vp install`                                              |
| `pnpm add [-D] x`         | `vp add [-D] x` (in a package: `vp -C apps/<name> add x`) |
| `pnpm remove x`           | `vp remove x`                                             |
| `pnpm run x`, `pnpm -r x` | `vp run x`, `vp run -r x`                                 |
| `npx x` (installed)       | `vp exec x`                                               |
| `npx x` (one-off)         | `vp dlx x`                                                |
| `tsx file.ts`             | `vpx file.ts`                                             |
| anything else             | `vp pm <cmd>`                                             |

## Agent skills

### Issue tracker

Issues live in GitHub Issues for iangregsondev/herdr-mods, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `GLOSSARY.md` and `docs/adr/` cover all mods. See `docs/agents/domain.md`.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Running Scripts

Run TypeScript and JavaScript files with `vpx <file>`, for example `vpx ./scripts/seed.ts --dry-run`. It handles enums, decorators, JSX, and tsconfig `paths`, so do not add `tsx` or `ts-node` to run scripts. `vpx --watch <file>` reruns the file when a file it uses changes, in place of `tsx watch`. `vp node <file>` runs plain Node.js.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->
