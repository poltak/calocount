import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: fileURLToPath(new URL("./fixture", import.meta.url)),
  plugins: [react()],
  server: {
    host: "127.0.0.1", port: 4178, strictPort: true, watch: null,
    fs: { allow: [fileURLToPath(new URL("../../", import.meta.url))] },
  },
});
