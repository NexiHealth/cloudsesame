export interface HttpResponse {
  /** HTTP status, or 0 when the request failed (network error, timeout). */
  status: number;
  body: string;
}

export type Http = (
  url: string,
  init: { method: "GET" | "POST"; headers?: Record<string, string>; body?: string; timeout?: number },
) => Promise<HttpResponse>;

/** Make a request with the runtime's fetch. Never rejects. */
export const http: Http = async (url, { timeout, ...init }) => {
  try {
    const res = await fetch(url, { ...init, signal: timeout ? AbortSignal.timeout(timeout) : undefined });
    return { status: res.status, body: await res.text() };
  } catch (error) {
    return { status: 0, body: (error as Error).message };
  }
};
