import { defineConfig } from "vitepress";

const repo = "https://github.com/NexiHealth/cloudsesame";
// GitHub Pages project site. Use "/" (and update `site`) if you serve the docs from a custom domain.
const base = "/cloudsesame/";
const site = `https://nexihealth.github.io${base}`;
const description = "Checks that you're online and logged in to gcloud, aws and az before you work, and logs you in when you're not.";

export default defineConfig({
  title: "cloudsesame",
  titleTemplate: ":title · cloudsesame",
  description,
  base,
  cleanUrls: true,
  lastUpdated: true,
  sitemap: { hostname: site },
  head: [
    ["link", { rel: "icon", type: "image/png", href: `${base}favicon.png` }],
    ["link", { rel: "apple-touch-icon", href: `${base}logo.png` }],
    ["meta", { name: "theme-color", content: "#ffc454" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: "cloudsesame" }],
    ["meta", { property: "og:title", content: "cloudsesame: open sesame for your clouds" }],
    ["meta", { property: "og:description", content: description }],
    ["meta", { property: "og:image", content: `${site}og.png` }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
  ],
  themeConfig: {
    logo: { src: "/logo.png", alt: "" },
    nav: [
      { text: "Guide", link: "/guide/getting-started", activeMatch: "^/guide/(?!recipes|providers)" },
      { text: "Providers", link: "/guide/providers" },
      { text: "Recipes", link: "/guide/recipes" },
      {
        text: "Links",
        items: [
          { text: "npm package", link: "https://www.npmjs.com/package/cloudsesame" },
          { text: "Releases", link: `${repo}/releases` },
          { text: "Agent Skill", link: `${repo}/blob/main/skills/cloudsesame/SKILL.md` },
          { text: "Contributing", link: `${repo}/blob/main/CONTRIBUTING.md` },
        ],
      },
    ],
    sidebar: [
      {
        text: "Introduction",
        items: [
          { text: "Getting started", link: "/guide/getting-started" },
          { text: "Installation", link: "/guide/installation" },
        ],
      },
      {
        text: "Guide",
        items: [
          { text: "Configuration", link: "/guide/configuration" },
          { text: "Commands", link: "/guide/commands" },
          { text: "Providers", link: "/guide/providers" },
          { text: "CI and AI agents", link: "/guide/agents" },
        ],
      },
      {
        text: "Recipes",
        collapsed: false,
        items: [
          { text: "Web app on Google Cloud", link: "/guide/recipes#web-app-on-google-cloud" },
          { text: "Infra repo: GCP + AWS", link: "/guide/recipes#infra-repo-opentofu-on-gcp-and-aws" },
          { text: "Azure", link: "/guide/recipes#azure" },
          { text: "Monorepo", link: "/guide/recipes#monorepo" },
          { text: "Never block anyone", link: "/guide/recipes#never-block-anyone" },
          { text: "CI pipelines", link: "/guide/recipes#ci-pipelines" },
        ],
      },
    ],
    socialLinks: [
      { icon: "github", link: repo },
      { icon: "npm", link: "https://www.npmjs.com/package/cloudsesame" },
    ],
    editLink: {
      pattern: `${repo}/edit/main/docs/:path`,
      text: "Edit this page on GitHub",
    },
    lastUpdated: {
      text: "Updated",
      formatOptions: { dateStyle: "medium" },
    },
    outline: { level: [2, 3] },
    search: { provider: "local" },
    footer: {
      message: `Released under the <a href="${repo}/blob/main/LICENSE">Apache-2.0 License</a>.`,
    },
  },
});
