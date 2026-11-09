import { Logic } from "@app/common/features/core/logic/logic";
import type { FrontendLogicProps } from "../../core/logic/types.js";

type SettingsProps = FrontendLogicProps;

interface SettingsState {
  isOpen: boolean;
}

/** Whether the settings dialog of the owner is open. */
export class SettingsLogic extends Logic<SettingsProps, SettingsState> {
  constructor(deps: SettingsProps) {
    super({ deps, initialState: { isOpen: false } });
  }

  open(): void {
    this.setState({ isOpen: true });
  }

  close(): void {
    this.setState({ isOpen: false });
  }
}
