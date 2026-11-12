import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type { ReactNode, RefObject } from "react";
import "./components.css";
import { XIcon } from "lucide-react";
import { Button } from "../shadcn/button.js";

/**
 * The owner keeps `open` in its Logic. Escape, Close, and a click outside
 * call `onClose`.
 */
export function Dialog({
  open,
  onClose,
  title,
  size = "sm",
  actions,
  initialFocus,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  size?: "sm" | "md" | "lg" | undefined;
  /** The buttons at the bottom. The main action comes last. */
  actions?: ReactNode;
  /** The confirm button of a dialog that Enter must confirm. */
  initialFocus?: RefObject<HTMLElement | null> | undefined;
  children: ReactNode;
}) {
  return (
    <BaseDialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop
          className="ui-dialog-backdrop"
          data-slot="dialog-backdrop"
        />
        <BaseDialog.Viewport
          className="ui-dialog-viewport"
          data-slot="dialog-viewport"
        >
          <BaseDialog.Popup
            className="ui-dialog"
            data-slot="dialog-content"
            data-size={size}
            initialFocus={initialFocus}
          >
            <div className="ui-dialog-head" data-slot="dialog-header">
              <BaseDialog.Title data-slot="dialog-title">
                {title}
              </BaseDialog.Title>
              <Button
                variant="outline"
                aria-label="Close"
                title="Close"
                size="icon-sm"
                onClick={onClose}
              >
                <XIcon />
              </Button>
            </div>
            <div className="ui-dialog-body" data-slot="dialog-body">
              {children}
            </div>
            {actions && (
              <div className="ui-dialog-foot" data-slot="dialog-footer">
                {actions}
              </div>
            )}
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
