import { useRef } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useLogicInstance } from "../../core/logic/use-logic.js";
import { Toolbar } from "../../core/ui/components/layout.js";
import { Text } from "../../core/ui/components/text.js";
import { Badge } from "../../core/ui/shadcn/badge.js";
import { Button } from "../../core/ui/shadcn/button.js";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../core/ui/shadcn/card.js";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../core/ui/shadcn/collapsible.js";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../core/ui/shadcn/dialog.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../core/ui/shadcn/dropdown-menu.js";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "../../core/ui/shadcn/popover.js";
import type { ComponentLibraryLogic } from "./component-library-logic.js";

export function OverlayExamples({ logic }: { logic: ComponentLibraryLogic }) {
  const state = useLogicInstance(logic);
  const dialogContent = useRef<HTMLDivElement>(null);

  return (
    <section aria-label="DropdownMenu, Collapsible, Dialog, Popover, Toolbar">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>DropdownMenu, Collapsible, Dialog, Popover, Toolbar</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Dialog
            open={state.dialogOpen}
            onOpenChange={(open) =>
              open ? logic.openDialog() : logic.closeDialog()
            }
          >
            <Toolbar
              start={
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger render={<Button variant="outline" />}>
                    Actions <ChevronDownIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" aria-label="Actions">
                    <DropdownMenuItem
                      onClick={() => logic.chooseMenuAction("Duplicate")}
                    >
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => logic.chooseMenuAction("Remove")}
                    >
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
              end={
                <DialogTrigger render={<Button variant="outline" />}>
                  Discard changes
                </DialogTrigger>
              }
            />
            <DialogContent
              ref={dialogContent}
              initialFocus={() =>
                dialogContent.current?.querySelector<HTMLButtonElement>(
                  ':scope > [data-slot="dialog-close"]',
                ) ?? null
              }
            >
              <DialogHeader>
                <DialogTitle>Discard the changes?</DialogTitle>
                <DialogDescription>
                  The changes you made are lost.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>
                  Keep editing
                </DialogClose>
                <DialogClose render={<Button variant="destructive" />}>
                  Discard
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {state.lastMenuAction && (
            <Text variant="meta">Last menu action: {state.lastMenuAction}</Text>
          )}
          <Collapsible
            open={state.historyOpen}
            onOpenChange={(open) => logic.setHistoryOpen(open)}
          >
            <CollapsibleTrigger render={<Button variant="ghost" />}>
              {state.historyOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
              History <Badge variant="secondary">2</Badge>
            </CollapsibleTrigger>
            <CollapsibleContent keepMounted>
              <Text>Created on 1 November. Edited on 3 November.</Text>
            </CollapsibleContent>
          </Collapsible>
          <Popover>
            <PopoverTrigger render={<Button variant="outline" />}>
              Invoice details
            </PopoverTrigger>
            <PopoverContent align="start">
              <PopoverHeader>
                <PopoverTitle>Invoice details</PopoverTitle>
                <PopoverDescription>
                  Sent to Ada Lovelace on 3 November.
                </PopoverDescription>
              </PopoverHeader>
            </PopoverContent>
          </Popover>
        </CardContent>
      </Card>
    </section>
  );
}
