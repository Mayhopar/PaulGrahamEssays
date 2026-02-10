// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://Mayhopar.github.io",
  base: "/PaulGrahamEssays",
  vite: {
    plugins: [tailwindcss()],
  },
});
