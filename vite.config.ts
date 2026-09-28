import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import vinext from "vinext";

export default defineConfig({
  plugins: [
    vinext(),
    tailwindcss(),
    cloudflare({
      // Workers AI has no local simulator; set CLOUDFLARE_REMOTE_BINDINGS=1 (with a Cloudflare login) to use it in dev.
      remoteBindings: process.env.CLOUDFLARE_REMOTE_BINDINGS === "1",
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": new URL("./", import.meta.url).pathname,
    },
  },
});
