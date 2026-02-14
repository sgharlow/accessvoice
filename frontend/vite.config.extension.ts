import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Rename index.extension.html -> index.html in the output bundle
function renameHtml(): Plugin {
  return {
    name: "rename-extension-html",
    enforce: "post",
    generateBundle(_options, bundle) {
      const key = "index.extension.html";
      if (bundle[key]) {
        const asset = bundle[key];
        asset.fileName = "index.html";
        bundle["index.html"] = asset;
        delete bundle[key];
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), renameHtml()],
  base: "./",
  build: {
    outDir: path.resolve(__dirname, "../extension/sidepanel"),
    emptyDir: true,
    rollupOptions: {
      input: {
        "index.extension": path.resolve(__dirname, "index.extension.html"),
      },
    },
  },
});
