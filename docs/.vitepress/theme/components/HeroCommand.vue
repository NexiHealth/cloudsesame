<script setup lang="ts">
import { ref } from "vue";

const command = "bunx cloudsesame";
const copied = ref(false);

async function copy() {
  try {
    await navigator.clipboard.writeText(command);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1600);
  } catch {
    // Clipboard blocked: the command is still selectable.
  }
}
</script>

<template>
  <button class="cs-hero-command" type="button" :aria-label="`Copy ${command}`" @click="copy">
    <span class="prompt" aria-hidden="true">$</span>
    <code>{{ command }}</code>
    <span class="state">{{ copied ? "copied" : "copy" }}</span>
  </button>
</template>
