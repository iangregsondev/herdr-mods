import { defineConfig } from "vite-plus";
import { modPack } from "../../mod-pack.ts";

export default defineConfig({
  pack: modPack("hello"),
});
