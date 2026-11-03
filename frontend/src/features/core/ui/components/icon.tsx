import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleX,
  Clock,
  CornerDownLeft,
  Copy,
  Download,
  ExternalLink,
  Info,
  LayoutGrid,
  Minus,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  StickyNote,
  Trash2,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import "./components.css";

/**
 * Each icon of the app, by name. `meaning` says what the icon stands for, so
 * that the same icon has one meaning everywhere. A new icon gets a name and
 * a meaning here, and a line in `docs/agents/ui-components.md`.
 */
export const ICONS = {
  notes: {
    meaning: "Goes to the notes.",
    component: StickyNote,
  },
  components: {
    meaning: "Goes to the component library.",
    component: LayoutGrid,
  },
  settings: {
    meaning: "Goes to the settings.",
    component: Settings,
  },
  "chevron-down": {
    meaning: "Opens a menu or a select.",
    component: ChevronDown,
  },
  "chevron-left": {
    meaning: "Goes back, or shows earlier tabs.",
    component: ChevronLeft,
  },
  "chevron-right": {
    meaning: "Opens a closed part, such as a Disclosure, or shows later tabs.",
    component: ChevronRight,
  },
  plus: {
    meaning: "Adds an item, or zooms in.",
    component: Plus,
  },
  minus: {
    meaning: "Zooms out, or takes a part away.",
    component: Minus,
  },
  close: {
    meaning: "Closes a dialog or a panel, or takes a chip away.",
    component: X,
  },
  check: {
    meaning: "Done, or chosen.",
    component: Check,
  },
  enter: {
    meaning: "Saves a field, as the Enter key does.",
    component: CornerDownLeft,
  },
  search: {
    meaning: "Searches a list.",
    component: Search,
  },
  info: {
    meaning: "A fact to know. The icon of an info Notice.",
    component: Info,
  },
  warning: {
    meaning: "Needs a look. The icon of a warning Notice.",
    component: TriangleAlert,
  },
  error: {
    meaning: "Failed. The icon of an error Notice and of a field error.",
    component: CircleX,
  },
  success: {
    meaning: "Finished well. The icon of a success Notice.",
    component: CircleCheck,
  },
  external: {
    meaning: "Opens in a new tab, or on another site.",
    component: ExternalLink,
  },
  download: {
    meaning: "Saves a file to the computer.",
    component: Download,
  },
  copy: {
    meaning: "Copies text or a file to the clipboard.",
    component: Copy,
  },
  edit: {
    meaning: "Edits an item.",
    component: Pencil,
  },
  trash: {
    meaning: "Removes an item.",
    component: Trash2,
  },
  refresh: {
    meaning: "Makes a part again from the data as it is now.",
    component: RefreshCw,
  },
  more: {
    meaning: "Opens more actions.",
    component: MoreHorizontal,
  },
  clock: {
    meaning: "Shows a history.",
    component: Clock,
  },
} as const satisfies Record<string, { meaning: string; component: LucideIcon }>;

export type IconName = keyof typeof ICONS;

/**
 * A line icon at the size of the text around it. It is for the eye only, so
 * the control around it carries the name.
 */
export function Icon({ name }: { name: IconName }) {
  const Glyph = ICONS[name].component;
  return (
    <Glyph
      className="ui-icon"
      size="1em"
      aria-hidden="true"
      focusable="false"
      data-icon={name}
    />
  );
}
