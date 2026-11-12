import { Alert, AlertDescription } from "../../core/ui/shadcn/alert.js";
import { CircleCheckIcon, SearchIcon } from "lucide-react";
import { useLogicInstance } from "../../core/logic/use-logic.js";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../core/ui/shadcn/card.js";
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
  const query = state.search.trim();
  const example = "Invoice 1043 is overdue by nine days.";
  const matches = query
    ? example.split(
        new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"),
      )
    : [example];
  return (
    <section aria-label="Input, Textarea, InputGroup, Select, Checkbox, RadioGroup">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Input, Textarea, InputGroup, Select, Checkbox, RadioGroup</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid items-start gap-4 md:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-4">
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
              <p className="text-sm text-muted-foreground">
                {matches.map((part, index) =>
                  index % 2 === 1 ? (
                    <mark
                      key={index}
                      className="rounded-sm bg-accent text-accent-foreground"
                    >
                      {part}
                    </mark>
                  ) : (
                    part
                  ),
                )}
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-4">
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
                  onCheckedChange={(checked) =>
                    logic.setIncludeArchive(checked)
                  }
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
                        <FieldLabel
                          htmlFor={`example-channel-${channel.value}`}
                        >
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
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

export function FormExamples({ logic }: { logic: ComponentLibraryLogic }) {
  const state = useLogicInstance(logic);
  return (
    <section aria-label="Field, FieldGroup, FieldSet">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Field, FieldGroup, FieldSet</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <form
            aria-label="Example form"
            onSubmit={(event) => {
              event.preventDefault();
              logic.submitForm();
            }}
          >
            <FieldGroup>
              <Field data-invalid={Boolean(state.contactNameError)}>
                <FieldLabel htmlFor="example-contact-name">
                  Contact name
                </FieldLabel>
                <Input
                  id="example-contact-name"
                  value={state.contactName}
                  onChange={(event) =>
                    logic.changeContactName(event.target.value)
                  }
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
              {state.submitted && (
                <output>
                  <Alert role="presentation">
                    <CircleCheckIcon aria-hidden="true" />
                    <AlertDescription>Saved.</AlertDescription>
                  </Alert>
                </output>
              )}
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
        </CardContent>
      </Card>
    </section>
  );
}
