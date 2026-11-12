import {
  CircleIcon,
  LayoutGridIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { Link } from "react-router";
import { Actions } from "../../core/ui/components/layout.js";
import { Card } from "../../core/ui/components/card.js";
import { InfoTip } from "../../core/ui/components/info-tip.js";
import { SectionHeader } from "../../core/ui/components/page-header.js";
import { Badge } from "../../core/ui/shadcn/badge.js";
import { Button } from "../../core/ui/shadcn/button.js";
import { ButtonGroup } from "../../core/ui/shadcn/button-group.js";
import { Spinner } from "../../core/ui/shadcn/spinner.js";
import { Tabs, TabsList, TabsTrigger } from "../../core/ui/shadcn/tabs.js";
import type { ExampleFilter } from "./component-library-logic.js";

export function ButtonExamples() {
  return (
    <Card label="Button, ButtonGroup" stack>
      <SectionHeader
        title="Button, ButtonGroup"
        description="One primary action for each form, dialog, or page."
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button>Primary</Button>
        <Button variant="outline">Secondary</Button>
        <Button variant="secondary">Secondary fill</Button>
        <Button variant="destructive">Danger</Button>
        <Button variant="destructive">Danger solid</Button>
        <Button variant="ghost">Ghost</Button>
        <Button size="sm" variant="outline">
          Small
        </Button>
        <Button variant="outline">
          <PlusIcon />
          With icon
        </Button>
        <Button variant="outline" disabled aria-busy="true">
          <Spinner aria-hidden="true" />
          Saving…
        </Button>
        <Button variant="outline" disabled>
          Disabled
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          nativeButton={false}
          render={({ role: _role, ...props }) => (
            <Link {...props} to="/components" />
          )}
        >
          Link to a page
        </Button>
        <Button
          variant="outline"
          nativeButton={false}
          render={({ role: _role, ...props }) => (
            <a
              {...props}
              aria-label="Link to a site"
              href="https://example.com"
              target="_blank"
              rel="noreferrer"
            />
          )}
        >
          Link to a site
        </Button>
        <Button variant="outline" size="icon" aria-label="Edit" title="Edit">
          <PencilIcon />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Remove"
          aria-keyshortcuts="Del"
          title="Remove (Del)"
        >
          <Trash2Icon />
        </Button>
        <InfoTip text="A short help text, on hover and on focus." />
      </div>
      <ButtonGroup aria-label="Zoom">
        <Button variant="outline">Zoom out</Button>
        <Button variant="outline">Zoom in</Button>
      </ButtonGroup>
    </Card>
  );
}

export function BadgeExamples() {
  return (
    <Actions>
      <Badge variant="secondary">Neutral</Badge>
      <Badge>
        <CircleIcon fill="currentColor" aria-hidden="true" />
        Draft
      </Badge>
      <Badge variant="outline">Paid</Badge>
      <Badge variant="outline">Expires soon</Badge>
      <Badge variant="destructive">Overdue</Badge>
      <Badge variant="secondary">
        <Spinner aria-hidden="true" />
        Syncing
      </Badge>
    </Actions>
  );
}

export function TabsExamples({
  filter,
  onFilterChange,
}: {
  filter: ExampleFilter;
  onFilterChange: (filter: ExampleFilter) => void;
}) {
  return (
    <Card label="Tabs" stack>
      <SectionHeader title="Tabs" />
      <Tabs value={filter} onValueChange={onFilterChange}>
        <TabsList aria-label="Example filter" activateOnFocus loopFocus>
          <TabsTrigger value="open">
            Open<Badge variant="secondary">3</Badge>
          </TabsTrigger>
          <TabsTrigger value="closed">
            Closed<Badge variant="secondary">1</Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <Tabs value={filter} onValueChange={onFilterChange}>
        <TabsList
          aria-label="Example parts"
          variant="line"
          activateOnFocus
          loopFocus
        >
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="closed">Closed</TabsTrigger>
        </TabsList>
      </Tabs>
      <nav aria-label="Example links">
        <Tabs value="/components">
          <TabsList role="presentation">
            <TabsTrigger
              value="/components"
              nativeButton={false}
              aria-selected={undefined}
              render={({ role: _role, ...props }, { active }) => (
                <Link
                  {...props}
                  aria-current={active ? "page" : undefined}
                  to="/components"
                />
              )}
            >
              <LayoutGridIcon />
              Components
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </nav>
    </Card>
  );
}
