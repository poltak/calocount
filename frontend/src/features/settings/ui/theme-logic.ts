import { Logic } from "@app/common/features/core/logic/logic";
import type { FrontendLogicProps } from "../../core/logic/types.js";
import type { ThemePreference } from "../utils/theme.js";

type ThemeProps = FrontendLogicProps<"settings", "theme">;

interface ThemeState {
  preference: ThemePreference;
}

/** The theme of this device. A choice applies at once and stays after a reload. */
export class ThemeLogic extends Logic<ThemeProps, ThemeState> {
  constructor(deps: ThemeProps) {
    super({
      deps,
      initialState: { preference: deps.storage.settings.readTheme() },
    });
  }

  protected override async onInitialize(): Promise<void> {
    this.deps.services.theme.apply(this.state.preference);
  }

  select({ preference }: { preference: ThemePreference }): void {
    this.deps.storage.settings.writeTheme({ theme: preference });
    this.deps.services.theme.apply(preference);
    this.setState({ preference });
  }
}
