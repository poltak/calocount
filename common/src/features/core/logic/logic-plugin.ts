import { Logic } from "./logic.js";

export interface LogicPluginOptions<Deps, State extends object> {
  deps: Deps;
  initialState: State;
}

/**
 * A separately testable state slice owned by one Logic instance. It shares the
 * Logic state and lifecycle API, but cannot own plugins of its own.
 */
export abstract class LogicPlugin<
  Deps,
  State extends object,
  Event = never,
> extends Logic<Deps, State, Event> {
  constructor({ deps, initialState }: LogicPluginOptions<Deps, State>) {
    super({ deps, initialState });
  }
}
