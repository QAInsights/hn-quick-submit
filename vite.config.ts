import { crx } from "@crxjs/vite-plugin";
import { defineConfig } from "vite";
import manifest from "./src/manifest";

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        popup: "src/pages/popup/index.html",
        settings: "src/pages/settings/index.html",
      },
    },
  },
});
