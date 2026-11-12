import { recommended as effectRecommended } from "@effect/tsgo/oxlint-presets";
import { defineConfig } from "vite-plus";

// CI has no Herdr app, so no gpui-kit/herdr types (docs/types.md): type-check and run the
// type-aware lint rules locally only. Without the types those rules see `any` and warn.
const typeCheck = !process.env.CI;

// mods/ is build output (committed for installs) and .herdr-types/ links the app's own files.
// .scratch/ holds local working notes (ignored by ~/.gitignore).
const ignorePatterns = ["mods/**", ".herdr-types/**", ".scratch/**"];

// Functional style in pure modules (.claude/rules/functional-style.md).
const PURE_RULES = ["no-let", "immutable-data", "no-loop-statements", "no-throw-statements"];

const pureRules = (level: "error" | "off") =>
  Object.fromEntries(PURE_RULES.map((rule) => [`functional/${rule}`, level]));

export default defineConfig({
  staged: {
    // lint-staged appends the staged paths; warnings fail like errors (Effect's rules are mostly warnings).
    "*": "vp check --fix --deny-warnings",
  },
  // .claude/skills/ holds upstream skills (skills-lock.json); reformatting them would drift from upstream.
  // The menus mod's stand-ins hold Herdr's patch points exactly as Herdr writes them; reformatting would move them.
  fmt: {
    ignorePatterns: [...ignorePatterns, ".claude/skills/**", "apps/menus/tests/fixtures/**"],
  },
  lint: {
    // Effect's rules. They need the oxlint that `prepare` patches (effect-tsgo patch).
    extends: [effectRecommended],
    ignorePatterns,
    jsPlugins: [
      { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
      { name: "functional", specifier: "./scripts/oxlint-functional.ts" },
    ],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      // Comments explain the code, not its history (.claude/rules/fixing-findings.md):
      // no leftover markers, no citing who asked for a change or where.
      "no-warning-comments": [
        "error",
        {
          terms: [
            "todo",
            "fixme",
            "xxx",
            "hack",
            "review",
            "reviewer",
            "pr #",
            "fixes #",
            "closes #",
            "issue #",
            "as discussed",
            "addresses comment",
          ],
          location: "anywhere",
        },
      ],
    },
    overrides: [
      // The only way to load gpui-kit.d.ts: it declares ambient modules, not exports.
      { files: ["herdr-env.d.ts"], rules: { "typescript/triple-slash-reference": "off" } },
      { files: ["apps/*/src/**", "packages/*/src/**"], rules: pureRules("error") },
      // A mod's View is a class Herdr mutates through init/render: exempt it.
      { files: ["apps/*/src/main.ts"], rules: pureRules("off") },
      // Effect code is tested with @effect/vitest (.claude/rules/tests.md), which Effect marks
      // unstable. The tests depend on it on purpose, so the warning would only be noise there.
      {
        files: ["scripts/*.test.ts", "apps/*/tests/**", "packages/*/tests/**"],
        rules: { "effecttsgo/unstable-api-usage": "off" },
      },
      // Every cast says why, main.ts, scripts and the shared pack config included.
      {
        files: ["apps/*/src/**", "packages/*/src/**", "scripts/**", "mod-pack.ts"],
        rules: { "functional/explained-cast": "error" },
      },
    ],
    options: { typeAware: typeCheck, typeCheck },
  },
  run: {
    cache: true,
    // These act on the Herdr app's folder, outside the repo, where the cache can't see changes.
    // Cached, they would replay an old result without running.
    tasks: {
      types: { command: "vpx scripts/herdr-types.ts", cache: false },
      // herdr-app check on every built mod, on the dev target's Herdr host.
      "check:mods": { command: "vpx scripts/check-mods.ts", cache: false },
      "dev:remove": { command: "vpx scripts/dev-remove.ts", cache: false },
      // herdr-app on the dev target's Herdr host: here, or over SSH (herdr-dev.json).
      herdr: { command: "vpx scripts/herdr.ts", cache: false },
      "herdr:sync": { command: "vpx scripts/herdr-sync.ts", cache: false },
      // Reads git's file list, which the cache doesn't track.
      "audit:config": { command: "vpx scripts/audit.ts", cache: false },
    },
  },
});
