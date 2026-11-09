// Web platform APIs that both browsers and Node provide. The ES library does
// not declare them, and the DOM library would also allow browser-only globals.
// Consumers resolve these names to their own DOM or Node declarations.

interface AbortSignal {
  readonly aborted: boolean;
  readonly reason: unknown;
  throwIfAborted(): void;
  addEventListener(type: "abort", listener: () => void): void;
  removeEventListener(type: "abort", listener: () => void): void;
}

interface AbortController {
  readonly signal: AbortSignal;
  abort(reason?: unknown): void;
}

declare var AbortController: {
  prototype: AbortController;
  new (): AbortController;
};

interface Console {
  debug(...data: unknown[]): void;
  info(...data: unknown[]): void;
  warn(...data: unknown[]): void;
  error(...data: unknown[]): void;
}

declare var console: Console;
