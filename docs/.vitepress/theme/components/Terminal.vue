<script setup lang="ts">
import { computed, ref } from "vue";

// Each line is a list of [text, class] spans. Classes map to the terminal palette in custom.css.
type Span = [string, string?];
interface Scene {
  id: string;
  label: string;
  cwd: string;
  lines: Span[][];
}

const scenes: Scene[] = [
  {
    id: "expired",
    label: "Expired login",
    cwd: "~/acme/infra",
    lines: [
      [["$ ", "dim"], ["bunx cloudsesame infra", "cmd"]],
      [["✔", "ok"], [" online"]],
      [["✖", "err"], [" "], ["gcloud", "b"], [" user"], ["  me@acme.dev", "dim"], ["  reauthentication required", "err"]],
      [["  → gcloud auth login --update-adc", "dim"]],
      [["✔", "ok"], [" "], ["gcloud", "b"], [" adc"]],
      [["✔", "ok"], [" "], ["gcloud", "b"], [" quota project"], ["  acme-billing", "dim"]],
      [["✔", "ok"], [" "], ["aws", "b"], [" prod"], ["  arn:aws:sts::222222222222:assumed-role/Admin/me", "dim"]],
      [],
      [["?", "ask"], [" "], ["gcloud isn't ready.", "b"]],
      [["❯", "ask"], [" "], ["Log in", "b"], [" (l)", "dim"], ["  gcloud auth login --update-adc", "dim"]],
      [["  Skip"], [" (s)", "dim"]],
      [["  Stop"], [" (x)", "dim"]],
    ],
  },
  {
    id: "ready",
    label: "All set",
    cwd: "~/acme/web",
    lines: [
      [["$ ", "dim"], ["bun dev", "cmd"]],
      [["$ cloudsesame predev", "dim"]],
      [["✔", "ok"], [" online"]],
      [["✔", "ok"], [" "], ["gcloud", "b"], [" user"], ["  me@acme.dev", "dim"]],
      [["✔", "ok"], [" "], ["gcloud", "b"], [" adc"]],
      [["✔", "ok"], [" "], ["aws", "b"], [" prod"], ["  arn:aws:sts::222222222222:assumed-role/Admin/me", "dim"]],
      [["✦ open sesame", "gold"]],
      [],
      [["$ vite", "dim"]],
      [["  ➜  Local:   http://localhost:5173/", "dim"]],
    ],
  },
  {
    id: "ci",
    label: "CI & agents",
    cwd: "runner",
    lines: [
      [["$ ", "dim"], ["cloudsesame infra", "cmd"]],
      [["✔ online"]],
      [["✔ gcloud user  ci@acme.dev"]],
      [["✔ gcloud adc"]],
      [["✖ aws prod  Error when retrieving token from sso: Token has expired and refresh failed"]],
      [["  → aws sso login --profile prod", "dim"]],
      [["✖ Not ready: aws prod", "err"]],
      [["  No terminal to prompt in. Run `aws sso login --profile prod`, or rerun with --skip to continue without it.", "err"]],
      [],
      [["$ ", "dim"], ["echo $?", "cmd"]],
      [["4", "b"]],
    ],
  },
  {
    id: "json",
    label: "--json",
    cwd: "~/acme/web",
    lines: [
      [["$ ", "dim"], ["cloudsesame check --json", "cmd"]],
      [["{"]],
      [['  "ok": '], ["false", "gold"], [","]],
      [['  "code": '], ["4", "gold"], [","]],
      [['  "online": '], ["true", "gold"], [","]],
      [['  "loggedIn": '], ["false", "gold"], [","]],
      [['  "results": [']],
      [['    { "provider": '], ['"gcloud"', "ok"], [', "label": '], ['"adc"', "ok"], [', "state": '], ['"ok"', "ok"], [" },"]],
      [['    { "provider": '], ['"gcloud"', "ok"], [', "label": '], ['"project"', "ok"], [', "state": '], ['"mismatch"', "ok"], [","]],
      [['      "message": '], ['"expected project acme-dev"', "ok"], [","]],
      [['      "fix": ['], ['"gcloud"', "ok"], [", "], ['"config"', "ok"], [", "], ['"set"', "ok"], [", "], ['"project"', "ok"], [", "], ['"acme-dev"', "ok"], ["] }"]],
      [["  ]"]],
      [["}"]],
    ],
  },
];

const active = ref(scenes[0]!.id);
const scene = computed(() => scenes.find((s) => s.id === active.value)!);
</script>

<template>
  <div class="cs-terminal" role="figure" :aria-label="`Terminal: ${scene.label}`">
    <div class="cs-terminal-bar">
      <span class="dots" aria-hidden="true"><i /><i /><i /></span>
      <div class="tabs" role="tablist">
        <button
          v-for="s in scenes"
          :key="s.id"
          role="tab"
          :aria-selected="s.id === active"
          :class="{ active: s.id === active }"
          @click="active = s.id"
        >
          {{ s.label }}
        </button>
      </div>
    </div>
    <pre :key="active" class="cs-terminal-body"><code><span
      v-for="(line, i) in scene.lines"
      :key="i"
      class="line"
      :style="{ '--i': i }"
    ><span v-for="(span, j) in line" :key="j" :class="span[1]">{{ span[0] }}</span>{{ "\n" }}</span></code></pre>
  </div>
</template>
