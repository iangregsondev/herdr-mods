# herdr-mods

Mods and layouts for the Herdr app (GUI, `~/.config/herdr-app`). Not the Herdr TUI and its `herdr-plugin.toml` plugins.

@docs/structure.md

## Herdr app

- `~/.config/herdr-app/AGENTS.md` is the source of truth for mods, layouts, keys and the `herdr` API. The app rewrites it to match the installed version. Read it before writing mod code. With a remote dev target it is on the Herdr host, not this machine.
- Check every built mod with `vp run check:mods` (`herdr-app check` on each `mods/iangregsondev-<name>/`). A mod isn't done without a pass.
- Never hand-edit `mods/`. It is build output: edit `apps/<name>/` and run `vp run -r build`, and commit `mods/` with the source change.
- Installed mods carry the `iangregsondev-` namespace: `apps/<name>/` builds to `mods/iangregsondev-<name>/` (ADR 0002). Commands take the short name. In mod code, use the build constant `__MOD_ID__` wherever the mod names itself (shared-state keys, settings file, layouts).
- To see a mod running, use the dev loop: `vp run <name>#dev` builds into the Herdr app, shows its panel and reloads on save; `vp run dev:remove <name>` (watch stopped first) removes the files and the panel. Both act on the dev target: this machine's Herdr, or a remote Herdr host over SSH when `herdr-dev.json` says `remote`. Run `herdr-app` as `vp run herdr <args…>` in both modes, and prove a change with `vp run herdr status` and `vp run herdr shot <file> --crop x,y,w,h`. Steps and never-dos: `.claude/rules/dev-loop.md`; human guide and remote setup: `docs/develop.md`. Never symlink a mod into Herdr: it doesn't hot-reload.
- Every mod ships `assets/RECIPE.md` and `assets/preview.png` (`.claude/rules/mod-sharing.md`).
- Every change to a mod or to `packages/` carries a changeset; CI fails the PR without one. Rules and bumps: `.claude/rules/changesets.md`.

## TDD — IMPORTANT

**TDD is mandatory** for every feature, bug fix and review finding in `apps/`, `packages/` and `scripts/`. Run the loop with this repo's `tdd` skill, every time, in the main thread and in every subagent. It is not optional and it is not a one-time read.

- **One behaviour per cycle.** Write one test, see it fail, write the least code that passes it, then the next test. Never write a whole test file and then the whole module.
- **Red means a failed assertion** on the new behaviour. "Cannot find module", a type error or a bad import is not red: add a stub export that returns the wrong value, then run again.
- **Gate:** show the red test and its failure output before writing the code. In the main thread, stop for my review. A subagent puts each red output in its report; the main thread rejects work that has none.
- **Seams:** a seam named in the spec's Testing Decisions or in the ticket counts as agreed. An unattended implementer uses only those; if it needs a new one, it stops that ticket and reports.
- **Requirements go in files at once.** TDD, Effect, or anything else I ask for between stages goes into the grill record straight away, and `/to-spec` copies it into the spec's Implementation and Testing Decisions. A requirement only in the chat is lost at `/clear`.
- Only UI glue in `main.ts` (the `View` class) and pure refactors with existing coverage are exempt. Logic found inside `main.ts` moves to a pure module and gets tests.

## Effect — IMPORTANT

**Mods use Effect (v4).** Pure logic uses `Option`, `Result` and `Predicate`. Every call to Herdr's promise API (`exec`, files, `fetch`) goes through an Effect service with tagged errors, as `.claude/rules/effect.md` shows (the `use` pattern), and is tested with `@effect/vitest`. Never `.catch(() => null)` a failure away: it becomes a tagged error and then view state. The spec and tickets for a mod name its Effect services.

Before writing any Effect code, first read `node_modules/effect/AGENTS.md` **completely**, and follow the links in the file when required. For APIs and concepts it doesn't cover, search the source in `node_modules/effect/src`. Effect is a root dev dependency (version in the `pnpm-workspace.yaml` catalog); a mod that uses it adds `"effect": "catalog:"` to its own `package.json`. What Herdr's runtime allows: `.claude/rules/effect.md`. Test Effect code with `@effect/vitest` (root dev dependency, also `catalog:`): `.claude/rules/tests.md`.

Effect v3 code (most examples online, other repos) won't compile here: `Either`, `Context.Tag` and `Effect.Service` are gone. The v3-to-v4 table is in `.claude/rules/functional-style.md`.

## Gotchas

- **Lint is oxlint, not ESLint.** ESLint plugins load through oxlint's `jsPlugins`, but any that need TypeScript's JS API (typescript-eslint's type utilities) fail to load under TypeScript 7. Write the rule into `scripts/oxlint-functional.ts` instead, with tests.
- **`vp run -r <task>` includes the root package** when it has that task. `vp run -r test` already runs the root's `scripts/*.test.ts`; don't add `vp run test` after it.

## Git and GitHub — IMPORTANT

- **Never commit or push to `main`.** Branch as `<type>/<issue>-<short-description>` (issue number left out when there's none), created as a worktree with `wt`. Agent-only local branches, `research/<slug>` and `prototype/<slug>` are exempt.
- Commits and PR titles follow Conventional Commits (`fix(hello): handle no spaces`), with a `Refs #123` footer when there's an issue. The PR title becomes the squash commit on `main`.
- Issues use the `.github/ISSUE_TEMPLATE/` templates, every section filled (`None` where empty). Issues made by skills (`/to-spec`, `/to-tickets`, `/triage`, wayfinder) use the skill's own format.
- **Feature**, **Task** and **Idea** are issues waiting to be picked up. Feature (issue type) is new behaviour to build, Task (issue type) is a chore (tooling, docs, upkeep), and Idea (`idea` label, since personal repos can't add custom types) is a maybe. When the user names some (`/grill-with-docs #23 #25`), read them as the starting brief and list them in the grill record. `/to-spec` links each from the spec issue, then closes it with a comment naming the spec. An Idea set aside is closed as not planned, with the reason.
- Write issue and PR bodies to `.scratch/<name>.md` and pass `--body-file`. Write PR bodies with the `pr` skill, and add the template's **Related issues** section (`Closes #123` for completed issues).
- This repo is public: no local paths, hostnames or machine details in issues, PRs or commits.
- Never merge PRs. The user merges.

## Package management: always `vp`

Never run `pnpm`, `npm`, `npx`, `pnpx`, `yarn` or `bun`. Installs that skip `vp` fail: a `preinstall` guard (`scripts/require-vp.sh`) stops any install not run through `vp` (`pnpm`, `npm` or `yarn`), and `devEngines` in `package.json` also refuses `npm` and `yarn`. Nothing stops a one-off `npx` or `pnpm dlx`, so use the table.

Every dependency version lives once, in the `catalog:` of `pnpm-workspace.yaml`; each `package.json` says `"catalog:"`, never a version. `vp add` does this itself (`catalogMode: prefer`): check the diff shows `"catalog:"`. To bump a dependency, change its catalog line, then `vp install`.

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
