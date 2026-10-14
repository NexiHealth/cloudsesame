// Ink requires Node >= 22. Below that, and with --plain or CLOUDSESAME_PLAIN=1, commands use plain output.
const INK_MIN_NODE = 22;

export function isPlain(flag: boolean): boolean {
  if (flag) return true;
  const env = process.env.CLOUDSESAME_PLAIN;
  if (env && env !== "0" && env !== "false") return true;
  return Number(process.versions.node.split(".")[0]) < INK_MIN_NODE;
}
