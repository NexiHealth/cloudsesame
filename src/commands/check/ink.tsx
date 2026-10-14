import { Box, render, Text, useApp } from "ink";
import { useEffect, useState } from "react";
import type { Context } from "../../command";
import { check, exitCode, type Report, type Target } from "../../core/check";
import type { Config } from "../../core/config/types";
import type { Status } from "../../core/providers/types";
import { Spinner } from "../../ui/spinner";
import { StatusLine } from "../../ui/status-line";
import { prepare } from "./shared";

function CheckView({ config, targets, onDone }: { config: Config; targets: Target[]; onDone: (r: Report) => void }) {
  const { exit } = useApp();
  const [online, setOnline] = useState<boolean | null>();
  const [results, setResults] = useState(new Map<Target, Status[]>());
  const [report, setReport] = useState<Report>();

  useEffect(() => {
    check(config, targets, {
      onOnline: setOnline,
      onResult: (t, s) => setResults((m) => new Map(m).set(t, s)),
    }).then(setReport);
  }, []);

  // Exit after the final state has rendered.
  useEffect(() => {
    if (!report) return;
    onDone(report);
    exit();
  }, [report]);

  return (
    <Box flexDirection="column">
      {online === undefined ? <Spinner label="checking connectivity" /> : online === null ? null : online ? <Text><Text color="green">✔</Text> online</Text> : <Text><Text color="red">✖</Text> offline</Text>}
      {online !== false &&
        online !== undefined &&
        targets.map((t, i) => {
          const statuses = results.get(t);
          return statuses ? statuses.map((s) => <StatusLine key={`${i}-${s.label}`} status={s} />) : <Spinner key={i} label={t.provider} />;
        })}
    </Box>
  );
}

export default async function (ctx: Context) {
  const { config, targets } = await prepare(ctx);
  let report: Report = { online: null, results: [] };
  await render(<CheckView config={config} targets={targets} onDone={(r) => (report = r)} />).waitUntilExit();
  return exitCode(report);
}
