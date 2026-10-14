import { renderToString } from "ink";
import type { ReactNode } from "react";

// One-shot output: render a component to a string and print it.
// For interactive UIs (input, spinners, live updates) use `render()` from ink and await `waitUntilExit()`.
export function print(node: ReactNode): void {
  console.log(renderToString(node, { columns: process.stdout.columns ?? 80 }));
}
