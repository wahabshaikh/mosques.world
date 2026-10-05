import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import vinext from "vinext";

export default defineConfig({
  // vinext only inlines NEXT_PUBLIC_* keys that exist at config time. Always
  // replace this one so a build without the variable does not read `process` in the browser.
  define: {
    "process.env.NEXT_PUBLIC_SENTRY_DSN": JSON.stringify(process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() ?? ""),
  },
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
