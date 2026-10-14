import { render, type useApp } from "ink";
import type { AnimationPolicy } from "../../core/config/types";
import { execInteractive } from "../../core/exec";
import { ExitCode } from "../../core/exit";
import { shouldAnimate } from "../../core/flow/policy";
import { runFlow } from "../../core/flow/run";
import { type Choice, type FlowEvent, type FlowOptions, type FlowResult, InterruptError, type Ui } from "../../core/flow/types";
import { type AppBridge, FlowApp } from "./flow-app";
import { Store } from "./store";

type Suspend = ReturnType<typeof useApp>["suspendTerminal"];

/** Bridges the flow engine (Ui) and the React tree (AppBridge). */
class InkUi implements Ui, AppBridge {
  readonly store = new Store();
  private suspend?: Suspend;
  private rejectInterrupt!: (error: Error) => void;
  /** Rejects on Ctrl-C; raced against the flow. */
  readonly interrupted = new Promise<never>((_, reject) => (this.rejectInterrupt = reject));

  emit(event: FlowEvent) {
    this.store.dispatch(event);
  }

  choose<T extends string>(message: string, choices: Choice<T>[]): Promise<T> {
    return new Promise<T>((resolve) => {
      this.store.update((v) => ({
        ...v,
        prompt: {
          message,
          choices,
          resolve: (value) => {
            this.store.update(({ prompt: _, ...rest }) => rest);
            resolve(value as T);
          },
        },
      }));
    });
  }

  async handOff(command: string[]): Promise<number> {
    let code = 1;
    const run = async () => {
      code = await execInteractive(command);
    };
    await (this.suspend ? this.suspend(run) : run());
    return code;
  }

  attach = (suspend: Suspend) => {
    this.suspend = suspend;
  };

  interrupt = () => this.rejectInterrupt(new InterruptError());

  finish(result: FlowResult, animate: boolean) {
    this.store.update((v) => ({ ...v, prompt: undefined, result, animate }));
  }

  animationDone = () => this.store.update((v) => ({ ...v, animate: false }));
}

export async function runFlowInk(opts: FlowOptions, animation?: AnimationPolicy): Promise<FlowResult> {
  const ui = new InkUi();
  ui.interrupted.catch(() => {});
  const app = render(<FlowApp bridge={ui} />, { exitOnCtrlC: false });

  let result: FlowResult;
  try {
    result = await Promise.race([runFlow(opts, ui), ui.interrupted]);
  } catch (error) {
    if (!(error instanceof InterruptError)) {
      app.unmount();
      throw error;
    }
    result = { code: ExitCode.Interrupted, online: null, results: [], loggedIn: false };
  }

  ui.finish(result, shouldAnimate({ policy: animation, interactive: opts.interactive, code: result.code, loggedIn: result.loggedIn }));
  await app.waitUntilExit();
  return result;
}
