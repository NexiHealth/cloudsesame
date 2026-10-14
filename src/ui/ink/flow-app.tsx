import { Box, Text, useApp, useInput, useStdin } from "ink";
import { useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import { targetLabel } from "../../core/targets";
import { formatCommand } from "../format";
import { Select } from "./select";
import { Spinner } from "./spinner";
import { StatusLine } from "./status-line";
import type { Row, Store } from "./store";
import { Vault } from "./vault";

export interface AppBridge {
  store: Store;
  attach(suspend: ReturnType<typeof useApp>["suspendTerminal"]): void;
  interrupt(): void;
  animationDone(): void;
}

function Online({ online }: { online?: boolean | null }) {
  if (online === undefined) return <Spinner label="checking connectivity" />;
  if (online === null) return null;
  return online ? (
    <Text>
      <Text color="green">✔</Text> online
    </Text>
  ) : (
    <Text>
      <Text color="red">✖</Text> offline
    </Text>
  );
}

function TargetRow({ row }: { row: Row }) {
  if (row.phase === "pending") return null;
  if (row.phase === "checking") return <Spinner label={targetLabel(row.target)} />;
  if (row.phase === "login") {
    return (
      <Text>
        <Text color="cyan">↪</Text> {formatCommand(row.command ?? [])}
      </Text>
    );
  }
  return (
    <>
      {row.statuses.map((s) => (
        <StatusLine key={s.label} status={row.skipped && s.state !== "ok" ? { ...s, message: `${s.message ?? ""} (skipped)`.trim() } : s} />
      ))}
    </>
  );
}

export function FlowApp({ bridge }: { bridge: AppBridge }) {
  const view = useSyncExternalStore(bridge.store.subscribe, bridge.store.get);
  const { exit, suspendTerminal } = useApp();
  const { isRawModeSupported } = useStdin();

  useLayoutEffect(() => bridge.attach(suspendTerminal), []);
  useInput((input, key) => key.ctrl && input === "c" && bridge.interrupt(), { isActive: isRawModeSupported });
  useEffect(() => {
    if (view.result && !view.animate) exit();
  }, [view.result, view.animate]);

  const ready = view.result?.code === 0 && view.rows.length > 0 && view.online !== false;

  return (
    <Box flexDirection="column">
      <Online online={view.online} />
      {view.rows.map((row, i) => (
        <TargetRow key={i} row={row} />
      ))}
      {view.messages.map((m, i) => (
        <Box key={i} flexDirection="column">
          <Text color={m.kind === "error" ? "red" : "yellow"}>
            {m.kind === "error" ? "✖" : "!"} {m.text}
          </Text>
          {m.hint && <Text dimColor>  {m.hint}</Text>}
        </Box>
      ))}
      {view.prompt && <Select key={view.prompt.message} message={view.prompt.message} choices={view.prompt.choices} onSelect={view.prompt.resolve} />}
      {view.animate && <Vault onDone={bridge.animationDone} />}
      {ready && !view.animate && view.result?.loggedIn && (
        <Text color="#ffc454" bold>
          ✦ open sesame
        </Text>
      )}
    </Box>
  );
}
