import { Box, Text } from "ink";
import type { State, Status } from "../../core/providers/types";
import { formatCommand, symbols } from "../format";

const colors: Record<State, string> = { ok: "green", unauthenticated: "red", mismatch: "yellow", missing: "red", error: "red" };

export function StatusLine({ status: s }: { status: Status }) {
  return (
    <Box flexDirection="column">
      <Text>
        <Text color={colors[s.state]}>{symbols[s.state]}</Text> <Text bold>{s.provider}</Text> {s.label}
        {s.identity && <Text dimColor>  {s.identity}</Text>}
        {s.message && <Text color={colors[s.state]}>  {s.message}</Text>}
      </Text>
      {s.fix && s.state !== "ok" && <Text dimColor>  → {formatCommand(s.fix)}</Text>}
    </Box>
  );
}
