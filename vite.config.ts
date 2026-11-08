import { defineConfig } from "vite-plus";

// CI has no Herdr app, so no gpui-kit/herdr types (docs/types.md): type-check locally only.
const typeCheck = !process.env.CI;

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  // mods/ is build output (committed for installs) and .herdr-types/ links the app's own files.
  // .scratch/ holds local working notes (ignored by ~/.gitignore).
  fmt: { ignorePatterns: ["mods/**", ".herdr-types/**", ".scratch/**"] },
  lint: {
    ignorePatterns: ["mods/**", ".herdr-types/**", ".scratch/**"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      // Needs strictNullChecks, which stays off to match the Herdr app (see tsconfig.json).
      "typescript/no-useless-default-assignment": "off",
    },
    overrides: [
      // The only way to load gpui-kit.d.ts: it declares ambient modules, not exports.
      { files: ["herdr-env.d.ts"], rules: { "typescript/triple-slash-reference": "off" } },
    ],
    options: { typeAware: true, typeCheck },
  },
  run: {
    cache: true,
  },
});
