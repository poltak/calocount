import { SearchIcon } from "lucide-react";
import { useLogicInstance } from "../../core/logic/use-logic.js";
import { Card } from "../../core/ui/components/card.js";
import { Columns, Stack } from "../../core/ui/components/layout.js";
import { SectionHeader } from "../../core/ui/components/page-header.js";
import { Highlight, Notice, Text } from "../../core/ui/components/text.js";
import { Button } from "../../core/ui/shadcn/button.js";
import { Checkbox } from "../../core/ui/shadcn/checkbox.js";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "../../core/ui/shadcn/field.js";
import { Input } from "../../core/ui/shadcn/input.js";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "../../core/ui/shadcn/input-group.js";
import {
  RadioGroup,
  RadioGroupItem,
} from "../../core/ui/shadcn/radio-group.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../core/ui/shadcn/select.js";
import { Textarea } from "../../core/ui/shadcn/textarea.js";
import type {
  ComponentLibraryLogic,
  ExampleChannel,
  ExamplePlan,
} from "./component-library-logic.js";

const PLANS = [
  { value: "free", label: "Free" },
  { value: "team", label: "Team" },
  { value: "business", label: "Business" },
] as const;

const CHANNELS = [
  { value: "email", label: "Email", hint: undefined },
  { value: "sms", label: "Text message", hint: undefined },
  { value: "push", label: "Push", hint: "Needs the app." },
] as const;

export function FieldExamples({ logic }: { logic: ComponentLibraryLogic }) {
  const state = useLogicInstance(logic);
  return (
    <Card
      label="Input, Textarea, InputGroup, Select, Checkbox, RadioGroup"
      stack
    >
      <SectionHeader title="Input, Textarea, InputGroup, Select, Checkbox, RadioGroup" />
      <Columns layout="even">
        <Stack>
          <Field>
            <FieldLabel htmlFor="example-name">Name</FieldLabel>
            <Input
              id="example-name"
              value={state.name}
              onChange={(event) => logic.changeName(event.target.value)}
              aria-describedby="example-name-description"
            />
            <FieldDescription id="example-name-description">
              The name that others see.
            </FieldDescription>
          </Field>
          <Field data-invalid>
            <FieldLabel htmlFor="example-email">Email</FieldLabel>
            <Input
              id="example-email"
              type="email"
              value=""
              onChange={() => undefined}
              aria-invalid
              aria-describedby="example-email-error"
            />
            <FieldError id="example-email-error">
              Enter an email address
            </FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="example-search">
              Search the example text
            </FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="example-search"
                type="search"
                value={state.search}
                onChange={(event) => logic.changeSearch(event.target.value)}
              />
              <InputGroupAddon>
                <SearchIcon aria-hidden="true" />
              </InputGroupAddon>
            </InputGroup>
          </Field>
          <Text variant="meta">
            <Highlight
              text="Invoice 1043 is overdue by nine days."
              query={state.search}
            />
          </Text>
        </Stack>
        <Stack>
          <Field>
            <FieldLabel htmlFor="example-plan">Plan</FieldLabel>
            <Select<ExamplePlan>
              items={PLANS}
              value={state.plan}
              onValueChange={(plan) => {
                if (plan !== null) {
                  logic.choosePlan(plan);
                }
              }}
            >
              <SelectTrigger id="example-plan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                {PLANS.map((plan) => (
                  <SelectItem key={plan.value} value={plan.value}>
                    {plan.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field orientation="horizontal">
            <Checkbox
              id="example-archive"
              checked={state.includeArchive}
              onCheckedChange={(checked) => logic.setIncludeArchive(checked)}
              aria-describedby="example-archive-description"
            />
            <FieldContent>
              <FieldLabel htmlFor="example-archive">
                Include archived items
              </FieldLabel>
              <FieldDescription id="example-archive-description">
                Archived items stay in the list.
              </FieldDescription>
            </FieldContent>
          </Field>
          <FieldSet>
            <FieldLegend id="example-channel-label" variant="label">
              Channel
            </FieldLegend>
            <RadioGroup
              value={state.channel}
              onValueChange={(channel: ExampleChannel) =>
                logic.chooseChannel(channel)
              }
              aria-labelledby="example-channel-label"
            >
              {CHANNELS.map((channel) => (
                <Field key={channel.value} orientation="horizontal">
                  <RadioGroupItem
                    value={channel.value}
                    id={`example-channel-${channel.value}`}
                    aria-describedby={
                      channel.hint
                        ? `example-channel-${channel.value}-description`
                        : undefined
                    }
                  />
                  <FieldContent>
                    <FieldLabel htmlFor={`example-channel-${channel.value}`}>
                      {channel.label}
                    </FieldLabel>
                    {channel.hint && (
                      <FieldDescription
                        id={`example-channel-${channel.value}-description`}
                      >
                        {channel.hint}
                      </FieldDescription>
                    )}
                  </FieldContent>
                </Field>
              ))}
            </RadioGroup>
          </FieldSet>
        </Stack>
      </Columns>
    </Card>
  );
}

export function FormExamples({ logic }: { logic: ComponentLibraryLogic }) {
  const state = useLogicInstance(logic);
  return (
    <Card label="Field, FieldGroup, FieldSet" stack>
      <SectionHeader title="Field, FieldGroup, FieldSet" />
      <form
        aria-label="Example form"
        onSubmit={(event) => {
          event.preventDefault();
          logic.submitForm();
        }}
      >
        <FieldGroup>
          <Field data-invalid={Boolean(state.contactNameError)}>
            <FieldLabel htmlFor="example-contact-name">Contact name</FieldLabel>
            <Input
              id="example-contact-name"
              value={state.contactName}
              onChange={(event) => logic.changeContactName(event.target.value)}
              aria-invalid={Boolean(state.contactNameError)}
              aria-describedby={
                state.contactNameError
                  ? "example-contact-name-error"
                  : undefined
              }
            />
            <FieldError id="example-contact-name-error">
              {state.contactNameError}
            </FieldError>
          </Field>
          <FieldSet>
            <FieldLegend variant="label">Details</FieldLegend>
            <FieldDescription>Shown to your team.</FieldDescription>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="example-note">Note</FieldLabel>
                <Textarea
                  id="example-note"
                  rows={3}
                  value={state.note}
                  onChange={(event) => logic.changeNote(event.target.value)}
                />
              </Field>
            </FieldGroup>
          </FieldSet>
          {state.submitted && <Notice tone="success">Saved.</Notice>}
          <Field orientation="horizontal">
            <Button type="submit">Save contact</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => logic.cancelForm()}
            >
              Cancel
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </Card>
  );
}
