import { Text, useAnimation } from "ink";

const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function Spinner({ label }: { label: string }) {
  const { frame } = useAnimation({ interval: 80 });
  return (
    <Text>
      <Text color="cyan">{frames[frame % frames.length]}</Text> <Text dimColor>{label}</Text>
    </Text>
  );
}
