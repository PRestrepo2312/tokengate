import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// server.fs.allow: la página importa ../../convex/_generated/api desde fuera de web/.
export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5174, fs: { allow: [path.resolve(__dirname, "..")] } },
});
