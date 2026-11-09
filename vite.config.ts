import { recommended as effectRecommended } from "@effect/tsgo/oxlint-presets";
import { defineConfig } from "vite-plus";

// CI has no Herdr app, so no gpui-kit/herdr types (docs/types.md): type-check locally only.
const typeCheck = !process.env.CI;

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  // mods/ is build output (committed for installs) and .herdr-types/ links the app's own files.
  // .scratch/ holds local working notes (ignored by ~/.gitignore).
  // .claude/skills/ holds upstream skills (skills-lock.json); reformatting them would drift from upstream.
  fmt: { ignorePatterns: ["mods/**", ".herdr-types/**", ".scratch/**", ".claude/skills/**"] },
  lint: {
    // Effect's rules. They need the oxlint that `prepare` patches (effect-tsgo patch).
    extends: [effectRecommended],
    ignorePatterns: ["mods/**", ".herdr-types/**", ".scratch/**"],
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
      // Functional style in pure modules (.claude/rules/functional-style.md).
      {
        files: ["apps/*/src/**", "packages/*/src/**"],
        rules: {
          "functional/no-let": "error",
          "functional/immutable-data": "error",
          "functional/no-loop-statements": "error",
          "functional/no-throw-statements": "error",
        },
      },
      // A mod's View is a class Herdr mutates through init/render: exempt it.
      {
        files: ["apps/*/src/main.ts"],
        rules: {
          "functional/no-let": "off",
          "functional/immutable-data": "off",
          "functional/no-loop-statements": "off",
          "functional/no-throw-statements": "off",
        },
      },
      // Every cast says why, main.ts and scripts included.
      {
        files: ["apps/*/src/**", "packages/*/src/**", "scripts/**"],
        rules: { "functional/explained-cast": "error" },
      },
    ],
    options: { typeAware: true, typeCheck },
  },
  run: {
    cache: true,
    // These act on the Herdr app's folder, outside the repo, where the cache can't see changes.
    // Cached, they would replay an old result without running.
    tasks: {
      types: { command: "sh scripts/link-herdr-types.sh", cache: false },
      "check:mods": {
        command: 'for d in mods/*/; do herdr-app check "$d" || exit 1; done',
        cache: false,
      },
      "dev:remove": { command: "vpx scripts/dev-remove.ts", cache: false },
      // Reads git's file list, which the cache doesn't track.
      "audit:config": { command: "vpx scripts/audit.ts", cache: false },
    },
  },
});
