import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import { h } from "vue";
import HeroCommand from "./components/HeroCommand.vue";
import Terminal from "./components/Terminal.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      "home-hero-actions-after": () => h(HeroCommand),
    }),
  enhanceApp({ app }) {
    app.component("Terminal", Terminal);
  },
} satisfies Theme;
