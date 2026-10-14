import { defineConfig } from "vitepress";

export default defineConfig({
  title: "cloudsesame",
  description: "Check and log in to gcloud, aws and az before you work",
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
          { text: "Configuration", link: "/guide/configuration" },
          { text: "Commands", link: "/guide/commands" },
          { text: "AI agents", link: "/guide/agents" },
        ],
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/NexiHealth/cloudsesame" }],
    search: { provider: "local" },
  },
});
