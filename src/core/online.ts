import { connect } from "node:net";

/** TCP-connect to `host:port`. Resolves false on DNS failure, refusal or timeout. */
export function isOnline(target: string, timeout = 3000): Promise<boolean> {
  const [host, port] = target.split(":");
  return new Promise((resolve) => {
    const socket = connect({ host, port: Number(port), timeout });
    const done = (online: boolean) => {
      socket.destroy();
      resolve(online);
    };
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}
