import { InfoIcon } from "lucide-react";
import { Button } from "../shadcn/button.js";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../shadcn/tooltip.js";

/**
 * An "i" icon that shows a short text on hover and on keyboard focus. The
 * text is also its accessible name, so a screen reader reads it. It is a
 * button, so it cannot be in a `<label>`.
 */
export function InfoTip({
  text,
  align = "start",
}: {
  text: string;
  /**
   * The side of the icon where the tip starts. A field on the right of a row
   * uses "end", so the tip stays on the screen.
   */
  align?: "start" | "end";
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={<Button variant="ghost" size="icon-xs" aria-label={text} />}
        >
          <InfoIcon />
        </TooltipTrigger>
        <TooltipContent align={align}>{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
