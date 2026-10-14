import { defineConfig } from "vitepress";

export default defineConfig({
  title: "cloudsesame",
  description: "cloudsesame CLI",
  // GitHub Pages project site. Use "/" if you serve the docs from a custom domain.
  base: "/cloudsesame/",
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    nav: [{ text: "Guide", link: "/guide/getting-started" }],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting started", link: "/guide/getting-started" },
          { text: "Installation", link: "/guide/installation" },
          { text: "Commands", link: "/guide/commands" },
        ],
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/OWNER/cloudsesame" }],
    search: { provider: "local" },
  },
});
