import { ChevronDownIcon, PencilIcon, PlusIcon } from "lucide-react";
import { Button } from "../../core/ui/shadcn/button.js";
import { Badge } from "../../core/ui/shadcn/badge.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../core/ui/shadcn/dropdown-menu.js";
import {
  Card,
  DataTable,
  KeyValueList,
  List,
  ListItem,
} from "../../core/ui/components/card.js";
import { Dialog } from "../../core/ui/components/dialog.js";
import { Disclosure } from "../../core/ui/components/disclosure.js";
import { ICONS, Icon, type IconName } from "../../core/ui/components/icon.js";
import { Page, Toolbar } from "../../core/ui/components/layout.js";
import { Loading } from "../../core/ui/components/loading.js";
import {
  PageHeader,
  SectionHeader,
} from "../../core/ui/components/page-header.js";
import {
  SettingGroup,
  SettingRow,
} from "../../core/ui/components/setting-list.js";
import { EmptyState, Notice, Text } from "../../core/ui/components/text.js";
import { useLogic } from "../../core/logic/use-logic.js";
import {
  BadgeExamples,
  ButtonExamples,
  TabsExamples,
} from "./control-examples.js";
import { ComponentLibraryLogic } from "./component-library-logic.js";
import { FieldExamples, FormExamples } from "./form-examples.js";

// A stable object: without React Compiler, a new object at each render would
// make a new Logic at each render.
const DEPS = { storage: {}, services: {}, api: {} };

const INVOICES = [
  { id: "1", name: "Invoice 1042", amount: "$120.00", overdue: false },
  { id: "2", name: "Invoice 1043", amount: "$89.50", overdue: true },
  { id: "3", name: "Invoice 1044", amount: "$310.00", overdue: false },
] as const;

/** Each shared component with its variants, in the real theme. */
export function ComponentLibraryPage() {
  const { logic, state } = useLogic({
    LogicClass: ComponentLibraryLogic,
    deps: DEPS,
  });

  return (
    <Page>
      <PageHeader
        title="Component library"
        subtitle="The shared components of the app. A page composes these, and has no styles of its own."
      />

      <ButtonExamples />

      <Card label="Badge, Notice, EmptyState, Loading, Text" stack>
        <SectionHeader title="Badge, Notice, EmptyState, Loading, Text" />
        <BadgeExamples />
        <Notice title="Info">A fact the person should know.</Notice>
        <Notice tone="warning">A fact that can change what they do.</Notice>
        <Notice tone="success">An action finished.</Notice>
        <Notice tone="error">An action failed.</Notice>
        <EmptyState icon="notes">No notes yet.</EmptyState>
        <Loading label="Loading the notes…" />
        <Loading label="Loading the summary" variant="skeleton" />
        <Text variant="description">A description under a title.</Text>
        <Text variant="meta">Written on 3 November</Text>
        <Text variant="label">Recent notes</Text>
      </Card>

      <TabsExamples
        filter={state.filter}
        onFilterChange={(filter) => logic.chooseFilter(filter)}
      />

      <FieldExamples logic={logic} />
      <FormExamples logic={logic} />

      <Card label="Card, List, KeyValueList, DataTable" stack>
        <SectionHeader
          title="Card, List, KeyValueList, DataTable"
          count={INVOICES.length}
          actions={
            <Button size="sm" variant="outline">
              <PlusIcon />
              Add
            </Button>
          }
        />
        <List label="Example list">
          <ListItem
            title="Invoice 1042"
            badges={<Badge variant="outline">Paid</Badge>}
            aside="3 Nov"
            actions={
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Edit invoice 1042"
                title="Edit invoice 1042"
              >
                <PencilIcon />
              </Button>
            }
          >
            <Text variant="meta">Sent to Ada Lovelace</Text>
          </ListItem>
          <ListItem
            title="Invoice 1043"
            badges={<Badge variant="destructive">Overdue</Badge>}
            aside="25 Oct"
          />
        </List>
        <KeyValueList
          items={[
            { key: "owner", label: "Owner", value: "Ada Lovelace" },
            { key: "plan", label: "Plan", value: "Team" },
          ]}
        />
        <DataTable
          caption="Example invoices"
          rows={INVOICES}
          rowKey={(row) => row.id}
          rowTone={(row) => (row.overdue ? "danger" : undefined)}
          columns={[
            { key: "name", header: "Invoice", render: (row) => row.name },
            {
              key: "amount",
              header: "Amount",
              align: "end",
              emphasis: true,
              render: (row) => row.amount,
            },
          ]}
        />
      </Card>

      <Card label="DropdownMenu, Disclosure, Dialog, Toolbar" stack>
        <SectionHeader title="DropdownMenu, Disclosure, Dialog, Toolbar" />
        <Toolbar
          start={
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger render={<Button variant="outline" />}>
                Actions
                <ChevronDownIcon />
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
            <Button variant="outline" onClick={() => logic.openDialog()}>
              Discard changes
            </Button>
          }
        />
        {state.lastMenuAction && (
          <Text variant="meta">Last menu action: {state.lastMenuAction}</Text>
        )}
        <Disclosure
          summary="History"
          count={2}
          open={state.historyOpen}
          onToggle={(open) => logic.setHistoryOpen(open)}
        >
          <Text>Created on 1 November. Edited on 3 November.</Text>
        </Disclosure>
        <Dialog
          open={state.dialogOpen}
          onClose={() => logic.closeDialog()}
          title="Discard the changes?"
          actions={
            <>
              <Button variant="outline" onClick={() => logic.closeDialog()}>
                Keep editing
              </Button>
              <Button variant="destructive" onClick={() => logic.closeDialog()}>
                Discard
              </Button>
            </>
          }
        >
          <Text>The changes you made are lost.</Text>
        </Dialog>
      </Card>

      <Card label="SettingGroup, SettingRow" tone="inset">
        <SettingGroup
          title="Notifications"
          description="How the app reaches you."
        >
          <SettingRow
            title="Email summary"
            description="One email each week."
            control={<Badge variant="outline">On</Badge>}
          />
          <SettingRow
            title="Text messages"
            control={<Badge variant="secondary">Off</Badge>}
          />
        </SettingGroup>
      </Card>

      <Card label="Icons" stack>
        <SectionHeader title="Icons" description="Each icon has one meaning." />
        <List label="Icons" variant="tinted" grid>
          {(Object.keys(ICONS) as IconName[]).map((name) => (
            <ListItem
              key={name}
              title={
                <>
                  <Icon name={name} /> {name}
                </>
              }
            >
              <Text variant="caption">{ICONS[name].meaning}</Text>
            </ListItem>
          ))}
        </List>
      </Card>
    </Page>
  );
}
