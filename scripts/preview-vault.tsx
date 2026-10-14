// Plays the open-sesame animation on its own: bun run preview:vault
import { render, useApp } from "ink";
import { Vault } from "../src/ui/ink/vault";

function Preview() {
  const { exit } = useApp();
  return <Vault onDone={() => exit()} />;
}

await render(<Preview />).waitUntilExit();
