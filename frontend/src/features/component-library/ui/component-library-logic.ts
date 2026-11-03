import { Logic } from "@app/common/features/core/logic/logic";
import type { FrontendLogicProps } from "../../core/logic/types.js";

export type ExampleFilter = "open" | "closed";
export type ExamplePlan = "free" | "team" | "business";
export type ExampleChannel = "email" | "sms" | "push";

interface ComponentLibraryState {
  filter: ExampleFilter;
  name: string;
  note: string;
  search: string;
  plan: ExamplePlan;
  includeArchive: boolean;
  channel: ExampleChannel;
  historyOpen: boolean;
  dialogOpen: boolean;
  lastMenuAction: string | null;
  /** The example form shows its error after a submit with no name. */
  nameError: string | null;
  submitted: boolean;
}

/** The state of the examples on the component library page. */
export class ComponentLibraryLogic extends Logic<
  FrontendLogicProps,
  ComponentLibraryState
> {
  constructor(deps: FrontendLogicProps) {
    super({
      deps,
      initialState: {
        filter: "open",
        name: "",
        note: "",
        search: "",
        plan: "free",
        includeArchive: true,
        channel: "email",
        historyOpen: false,
        dialogOpen: false,
        lastMenuAction: null,
        nameError: null,
        submitted: false,
      },
    });
  }

  chooseFilter(filter: ExampleFilter): void {
    this.setState({ filter });
  }

  changeName(name: string): void {
    this.setState({ name, nameError: null, submitted: false });
  }

  changeNote(note: string): void {
    this.setState({ note, submitted: false });
  }

  changeSearch(search: string): void {
    this.setState({ search });
  }

  choosePlan(plan: ExamplePlan): void {
    this.setState({ plan });
  }

  setIncludeArchive(includeArchive: boolean): void {
    this.setState({ includeArchive });
  }

  chooseChannel(channel: ExampleChannel): void {
    this.setState({ channel });
  }

  setHistoryOpen(historyOpen: boolean): void {
    this.setState({ historyOpen });
  }

  openDialog(): void {
    this.setState({ dialogOpen: true });
  }

  closeDialog(): void {
    this.setState({ dialogOpen: false });
  }

  chooseMenuAction(action: string): void {
    this.setState({ lastMenuAction: action });
  }

  submitForm(): void {
    if (this.state.name.trim() === "") {
      this.setState({ nameError: "Enter a name", submitted: false });
      return;
    }
    this.setState({ nameError: null, submitted: true });
  }

  cancelForm(): void {
    this.setState({ name: "", note: "", nameError: null, submitted: false });
  }
}
