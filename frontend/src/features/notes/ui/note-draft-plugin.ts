import { LogicPlugin } from "@app/common/features/core/logic/logic-plugin";
import type { AuthEvents } from "../../auth/types.js";
import type { FrontendLogicProps } from "../../core/logic/types.js";
import type { NoteDraft, NoteDraftOwner } from "../storage/types.js";

type NoteDraftProps = Pick<FrontendLogicProps<"notesDrafts">, "storage"> & {
  owner: NoteDraftOwner;
  authEvents: AuthEvents;
};

interface NoteDraftState {
  title: string;
  body: string;
  /** True when the fields came from browser storage, not from the saved note. */
  isRestored: boolean;
}

const EMPTY = {
  title: "",
  body: "",
  isRestored: false,
} satisfies NoteDraftState;

/**
 * The fields of one note form. It keeps what the user types in browser
 * storage, so that a reload or a closed tab does not lose it. The form that
 * creates a note and the form that changes one each own an instance.
 */
export class NoteDraftPlugin extends LogicPlugin<
  NoteDraftProps,
  NoteDraftState
> {
  constructor(deps: NoteDraftProps) {
    super({ deps, initialState: EMPTY });
  }

  protected override async onInitialize(): Promise<void> {
    // Only the form on the open page hears this event. That is sufficient
    // while each page behind the session gate has a note form. A project with
    // other pages must listen in a Logic that lives as long as the session.
    this.listen(this.deps.authEvents, ({ userId }) => {
      this.deps.storage.notesDrafts.removeAllOf({ userId });
      this.setState(EMPTY);
    });
    const stored = this.deps.storage.notesDrafts.read(this.deps.owner);
    if (stored) {
      this.setState({ ...stored, isRestored: true });
    }
  }

  setTitle(title: string): void {
    this.setState({ title });
    this.store();
  }

  setBody(body: string): void {
    this.setState({ body });
    this.store();
  }

  /** Fill the form with a note's saved content, unless a draft was restored. */
  startFrom({ title, body }: NoteDraft): void {
    if (!this.state.isRestored) {
      this.setState({ title, body });
    }
  }

  discard(): void {
    this.deps.storage.notesDrafts.remove(this.deps.owner);
    this.setState(EMPTY);
  }

  private store(): void {
    this.deps.storage.notesDrafts.write(this.deps.owner, {
      title: this.state.title,
      body: this.state.body,
    });
  }
}
