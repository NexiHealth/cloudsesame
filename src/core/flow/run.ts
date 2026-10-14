import { checkTarget, fixFor, isReady } from "../check";
import { defaultDeps, type Deps } from "../deps";
import { ExitCode } from "../exit";
import type { Status } from "../providers/types";
import { targetLabel } from "../targets";
import { formatCommand } from "../exec";
import type { Choice, FlowOptions, FlowResult, Policies, Ui } from "./types";

type TargetAction = "login" | "skip" | "stop" | "fail" | "report";

const NO_TERMINAL = "No terminal to prompt in.";

/**
 * Online check, provider checks, then resolve each failing target according to the policies:
 * prompt (log in / skip / stop), log in, skip, fail or just report.
 */
export async function runFlow({ config, targets, policies, interactive }: FlowOptions, ui: Ui, deps: Deps = defaultDeps): Promise<FlowResult> {
  const timeout = config.timeout ?? 20_000;
  const state = targets.map(() => ({ statuses: [] as Status[], skipped: false }));
  let loggedIn = false;
  let online: boolean | null = null;

  const result = (code: number): FlowResult => ({
    code,
    online,
    loggedIn,
    results: state.flatMap((s) => s.statuses.map((st) => (s.skipped && st.state !== "ok" ? { ...st, skipped: true as const } : st))),
  });

  const check = async (index: number) => {
    ui.emit({ type: "checking", index });
    state[index]!.statuses = await checkTarget(targets[index]!, deps, timeout);
    ui.emit({ type: "checked", index, statuses: state[index]!.statuses });
  };

  ui.emit({ type: "start", targets });

  // 1. Connectivity.
  const onlineCheck = config.onlineCheck ?? "www.gstatic.com:443";
  online = onlineCheck === false ? null : await deps.isOnline(onlineCheck);
  ui.emit({ type: "online", online });

  if (online === false) {
    const { action, noTerminal } = await decideOffline(policies, interactive, ui);
    if (action === "stop") return result(ExitCode.Stopped);
    if (action === "fail") {
      ui.emit({ type: "error", message: "You're offline.", hint: noTerminal ? `${NO_TERMINAL} Rerun with --skip to continue offline.` : undefined });
      return result(ExitCode.Offline);
    }
    ui.emit({ type: "warning", message: "Offline: skipped cloud checks." });
    return result(policies.strict ? ExitCode.Offline : ExitCode.Ok);
  }

  // 2. All providers in parallel.
  await Promise.all(targets.map((_, i) => check(i)));

  // 3. Resolve failing targets one at a time (logins need the terminal).
  const failed: number[] = [];
  let noTerminalFailure = false;

  for (const [index, target] of targets.entries()) {
    let attempts = 0;
    while (!isReady(state[index]!.statuses)) {
      const fix = fixFor(state[index]!.statuses);
      const { action, noTerminal } = await decideTarget(targetLabel(target), fix, attempts, policies, interactive, ui);
      noTerminalFailure ||= noTerminal;

      if (action === "stop") return result(ExitCode.Stopped);
      if (action === "report" || action === "fail") {
        failed.push(index);
        break;
      }
      if (action === "skip") {
        state[index]!.skipped = true;
        ui.emit({ type: "skipped", index });
        break;
      }

      attempts++;
      ui.emit({ type: "login", index, command: fix! });
      const code = await ui.handOff(fix!);
      if (code === 0) loggedIn = true;
      else ui.emit({ type: "login-failed", index, code });
      await check(index);
    }
  }

  // 4. Outcome.
  if (failed.length > 0 && policies.unauthenticated !== "report") {
    const fixes = failed.map((i) => fixFor(state[i]!.statuses)).filter((f): f is string[] => !!f);
    const run = fixes.length > 0 ? `Run ${fixes.map((f) => `\`${formatCommand(f)}\``).join(", ")}` : "Fix the issues above";
    ui.emit({
      type: "error",
      message: `Not ready: ${failed.map((i) => targetLabel(targets[i]!)).join(", ")}`,
      hint: noTerminalFailure ? `${NO_TERMINAL} ${run}, or rerun with --skip to continue without ${failed.length > 1 ? "them" : "it"}.` : `${run}.`,
    });
  }
  const skipped = state.some((s) => s.skipped);
  return result(failed.length > 0 || (skipped && policies.strict) ? ExitCode.Unauthenticated : ExitCode.Ok);
}

interface Decision<T> {
  action: T;
  /** The policy was `prompt`, but there was no terminal to prompt in. */
  noTerminal: boolean;
}

async function decideOffline(policies: Policies, interactive: boolean, ui: Ui): Promise<Decision<"continue" | "fail" | "stop">> {
  if (policies.offline !== "prompt") return { action: policies.offline, noTerminal: false };
  if (!interactive) return { action: policies.noTerminal === "skip" ? "continue" : "fail", noTerminal: true };
  const action = await ui.choose("You're offline. Continue anyway?", [
    { value: "continue", label: "Continue offline", key: "c" },
    { value: "stop", label: "Stop", key: "s" },
  ]);
  return { action, noTerminal: false };
}

async function decideTarget(
  label: string,
  fix: string[] | undefined,
  attempts: number,
  policies: Policies,
  interactive: boolean,
  ui: Ui,
): Promise<Decision<TargetAction>> {
  switch (policies.unauthenticated) {
    case "prompt":
      if (!interactive) return { action: policies.noTerminal === "skip" ? "skip" : "fail", noTerminal: true };
      return { action: await ui.choose(`${label} isn't ready.`, promptChoices(fix, attempts)), noTerminal: false };
    case "login":
      // One attempt: without a prompt there's no one to decide whether to retry.
      return { action: fix && attempts === 0 ? "login" : "fail", noTerminal: false };
    default:
      return { action: policies.unauthenticated, noTerminal: false };
  }
}

function promptChoices(fix: string[] | undefined, attempts: number): Choice<"login" | "skip" | "stop">[] {
  const isLogin = fix?.some((part) => part === "login");
  return [
    ...(fix ? [{ value: "login" as const, label: `${attempts > 0 ? "Retry" : isLogin ? "Log in" : "Fix"}`, key: "l", hint: formatCommand(fix) }] : []),
    { value: "skip", label: "Skip", key: "s" },
    { value: "stop", label: "Stop", key: "x" },
  ];
}
