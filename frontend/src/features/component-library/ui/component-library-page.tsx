import {
  Button,
  IconButton,
  LinkButton,
} from "../../core/ui/components/button.js";
import { Badge } from "../../core/ui/components/badge.js";
import { ButtonGroup } from "../../core/ui/components/button-group.js";
import {
  Card,
  DataTable,
  KeyValueList,
  List,
  ListItem,
} from "../../core/ui/components/card.js";
import { Dialog } from "../../core/ui/components/dialog.js";
import { Disclosure } from "../../core/ui/components/disclosure.js";
import {
  Checkbox,
  FieldGroup,
  RadioGroup,
  SearchInput,
  Select,
  TextArea,
  TextInput,
} from "../../core/ui/components/field.js";
import { Form, FormActions, FormRow } from "../../core/ui/components/form.js";
import { ICONS, Icon, type IconName } from "../../core/ui/components/icon.js";
import {
  Actions,
  Columns,
  Page,
  Stack,
  Toolbar,
} from "../../core/ui/components/layout.js";
import { Loading } from "../../core/ui/components/loading.js";
import { Menu } from "../../core/ui/components/menu.js";
import {
  PageHeader,
  SectionHeader,
} from "../../core/ui/components/page-header.js";
import {
  SettingGroup,
  SettingRow,
} from "../../core/ui/components/setting-list.js";
import { NavTabs, Tabs } from "../../core/ui/components/tabs.js";
import {
  EmptyState,
  Highlight,
  Notice,
  Text,
} from "../../core/ui/components/text.js";
import { useLogic } from "../../core/logic/use-logic.js";
import { InfoTip } from "../../core/ui/components/info-tip.js";
import {
  ComponentLibraryLogic,
  type ExampleChannel,
  type ExampleFilter,
  type ExamplePlan,
} from "./component-library-logic.js";

// A stable object: without React Compiler, a new object at each render would
// make a new Logic at each render.
const DEPS = { storage: {}, services: {}, api: {} };

const INVOICES = [
  { id: "1", name: "Invoice 1042", amount: "$120.00", overdue: false },
  { id: "2", name: "Invoice 1043", amount: "$89.50", overdue: true },
  { id: "3", name: "Invoice 1044", amount: "$310.00", overdue: false },
] as const;

const SEARCH_SAMPLE = "Invoice 1043 is overdue by nine days.";

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

      <Card label="Button, LinkButton, IconButton, ButtonGroup" stack>
        <SectionHeader
          title="Button, LinkButton, IconButton, ButtonGroup"
          description="One primary action for each form, dialog, or page."
        />
        <Actions>
          <Button variant="primary">Primary</Button>
          <Button>Secondary</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="danger-solid">Danger solid</Button>
          <Button variant="ghost">Ghost</Button>
          <Button size="sm">Small</Button>
          <Button icon="plus">With icon</Button>
          <Button busy busyLabel="Saving…">
            Save
          </Button>
          <Button disabled>Disabled</Button>
        </Actions>
        <Actions>
          <LinkButton to="/components">Link to a page</LinkButton>
          <LinkButton href="https://example.com" newTab>
            Link to a site
          </LinkButton>
          <IconButton icon="edit" label="Edit" />
          <IconButton icon="trash" label="Remove" shortcut="Del" />
          <InfoTip text="A short help text, on hover and on focus." />
        </Actions>
        <ButtonGroup label="Zoom">
          <Button>Zoom out</Button>
          <Button>Zoom in</Button>
        </ButtonGroup>
      </Card>

      <Card label="Badge, Notice, EmptyState, Loading, Text" stack>
        <SectionHeader title="Badge, Notice, EmptyState, Loading, Text" />
        <Actions>
          <Badge>Neutral</Badge>
          <Badge tone="info" dot>
            Draft
          </Badge>
          <Badge tone="success">Paid</Badge>
          <Badge tone="warning">Expires soon</Badge>
          <Badge tone="danger">Overdue</Badge>
          <Badge loading>Syncing</Badge>
        </Actions>
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

      <Card label="Tabs, NavTabs" stack>
        <SectionHeader title="Tabs, NavTabs" />
        <Tabs
          label="Example filter"
          variant="segmented"
          value={state.filter}
          onChange={(filter: ExampleFilter) => logic.chooseFilter(filter)}
          items={[
            { value: "open", label: "Open", count: 3 },
            { value: "closed", label: "Closed", count: 1 },
          ]}
        />
        <Tabs
          label="Example parts"
          variant="page"
          value={state.filter}
          onChange={(filter: ExampleFilter) => logic.chooseFilter(filter)}
          items={[
            { value: "open", label: "Open" },
            { value: "closed", label: "Closed" },
          ]}
        />
        <NavTabs
          label="Example links"
          items={[
            { to: "/components", label: "Components", icon: "components" },
          ]}
        />
      </Card>

      <Card
        label="TextInput, TextArea, SearchInput, Select, Checkbox, RadioGroup"
        stack
      >
        <SectionHeader title="TextInput, TextArea, SearchInput, Select, Checkbox, RadioGroup" />
        <Columns layout="even">
          <Stack>
            <TextInput
              label="Name"
              hint="The name that others see."
              value={state.name}
              onChange={(name) => logic.changeName(name)}
            />
            <TextInput
              label="Email"
              type="email"
              value=""
              onChange={() => undefined}
              error="Enter an email address"
            />
            <SearchInput
              label="Search the example text"
              value={state.search}
              onChange={(search) => logic.changeSearch(search)}
            />
            <Text variant="meta">
              <Highlight text={SEARCH_SAMPLE} query={state.search} />
            </Text>
          </Stack>
          <Stack>
            <Select<ExamplePlan>
              label="Plan"
              value={state.plan}
              onChange={(plan) => logic.choosePlan(plan)}
              options={[
                { value: "free", label: "Free" },
                { value: "team", label: "Team" },
                { value: "business", label: "Business" },
              ]}
            />
            <Checkbox
              label="Include archived items"
              hint="Archived items stay in the list."
              checked={state.includeArchive}
              onChange={(includeArchive) =>
                logic.setIncludeArchive(includeArchive)
              }
            />
            <RadioGroup<ExampleChannel>
              label="Channel"
              value={state.channel}
              onChange={(channel) => logic.chooseChannel(channel)}
              options={[
                { value: "email", label: "Email" },
                { value: "sms", label: "Text message" },
                { value: "push", label: "Push", hint: "Needs the app." },
              ]}
            />
          </Stack>
        </Columns>
      </Card>

      <Card label="Form, FormRow, FormActions, FieldGroup" stack>
        <SectionHeader title="Form, FormRow, FormActions, FieldGroup" />
        <Form label="Example form" onSubmit={() => logic.submitForm()}>
          <FormRow>
            <TextInput
              label="Contact name"
              value={state.contactName}
              onChange={(name) => logic.changeContactName(name)}
              error={state.contactNameError}
            />
          </FormRow>
          <FieldGroup legend="Details" note="Shown to your team.">
            <TextArea
              label="Note"
              value={state.note}
              onChange={(note) => logic.changeNote(note)}
            />
          </FieldGroup>
          {state.submitted && <Notice tone="success">Saved.</Notice>}
          <FormActions
            submitLabel="Save contact"
            onCancel={() => logic.cancelForm()}
          />
        </Form>
      </Card>

      <Card label="Card, List, KeyValueList, DataTable" stack>
        <SectionHeader
          title="Card, List, KeyValueList, DataTable"
          count={INVOICES.length}
          actions={
            <Button size="sm" icon="plus">
              Add
            </Button>
          }
        />
        <List label="Example list">
          <ListItem
            title="Invoice 1042"
            badges={<Badge tone="success">Paid</Badge>}
            aside="3 Nov"
            actions={
              <IconButton icon="edit" label="Edit invoice 1042" size="sm" />
            }
          >
            <Text variant="meta">Sent to Ada Lovelace</Text>
          </ListItem>
          <ListItem
            title="Invoice 1043"
            badges={<Badge tone="danger">Overdue</Badge>}
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

      <Card label="Menu, Disclosure, Dialog, Toolbar" stack>
        <SectionHeader title="Menu, Disclosure, Dialog, Toolbar" />
        <Toolbar
          start={
            <Menu
              label="Actions"
              items={[
                {
                  key: "duplicate",
                  label: "Duplicate",
                  onSelect: () => logic.chooseMenuAction("Duplicate"),
                },
                {
                  key: "remove",
                  label: "Remove",
                  danger: true,
                  onSelect: () => logic.chooseMenuAction("Remove"),
                },
              ]}
            />
          }
          end={
            <Button onClick={() => logic.openDialog()}>Discard changes</Button>
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
              <Button onClick={() => logic.closeDialog()}>Keep editing</Button>
              <Button
                variant="danger-solid"
                onClick={() => logic.closeDialog()}
              >
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
            control={<Badge tone="success">On</Badge>}
          />
          <SettingRow title="Text messages" control={<Badge>Off</Badge>} />
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
