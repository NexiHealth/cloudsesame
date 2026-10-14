import { Box, Text, useInput } from "ink";
import { useState } from "react";
import type { Choice } from "../../core/flow/types";

export function Select({ message, choices, onSelect }: { message: string; choices: Choice<string>[]; onSelect: (value: string) => void }) {
  const [active, setActive] = useState(0);

  useInput((input, key) => {
    if (key.upArrow || input === "k") setActive((i) => (i - 1 + choices.length) % choices.length);
    else if (key.downArrow || input === "j") setActive((i) => (i + 1) % choices.length);
    else if (key.return) onSelect(choices[active]!.value);
    else {
      const choice = choices.find((c) => c.key === input.toLowerCase());
      if (choice) onSelect(choice.value);
    }
  });

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        <Text color="cyan">?</Text> <Text bold>{message}</Text>
      </Text>
      {choices.map((c, i) => (
        <Text key={c.value}>
          <Text color="cyan">{i === active ? "❯" : " "}</Text> <Text bold={i === active}>{c.label}</Text>
          <Text dimColor> ({c.key})</Text>
          {c.hint && <Text dimColor>  {c.hint}</Text>}
        </Text>
      ))}
    </Box>
  );
}
