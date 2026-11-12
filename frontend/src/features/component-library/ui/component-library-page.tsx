import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "../../core/ui/shadcn/alert.js";
import {
  InfoIcon,
  TriangleAlertIcon,
  CircleCheckIcon,
  CircleXIcon,
  StickyNoteIcon,
} from "lucide-react";
import { Spinner } from "../../core/ui/shadcn/spinner.js";
import { Skeleton } from "../../core/ui/shadcn/skeleton.js";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../core/ui/shadcn/card.js";
import { Page } from "../../core/ui/components/layout.js";
import { PageHeader } from "../../core/ui/components/page-header.js";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "../../core/ui/shadcn/field.js";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../../core/ui/shadcn/empty.js";
import { Badge } from "../../core/ui/shadcn/badge.js";
import { useLogic } from "../../core/logic/use-logic.js";
import {
  BadgeExamples,
  ButtonExamples,
  TabsExamples,
} from "./control-examples.js";
import { ComponentLibraryLogic } from "./component-library-logic.js";
import { FieldExamples, FormExamples } from "./form-examples.js";
import { ContainerExamples } from "./container-examples.js";
import { OverlayExamples } from "./overlay-examples.js";
import { IconExamples } from "./icon-examples.js";

const DEPS = { storage: {}, services: {}, api: {} };

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

      <section aria-label="Badge, Alert, Empty, Spinner, Skeleton, Typography">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Badge, Alert, Empty, Spinner, Skeleton, Typography</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <BadgeExamples />
            <output>
              <Alert role="presentation">
                <InfoIcon aria-hidden="true" />
                <AlertTitle>{"Info"}</AlertTitle>
                <AlertDescription>
                  A fact the person should know.
                </AlertDescription>
              </Alert>
            </output>
            <output>
              <Alert role="presentation">
                <TriangleAlertIcon aria-hidden="true" />
                <AlertDescription>
                  A fact that can change what they do.
                </AlertDescription>
              </Alert>
            </output>
            <output>
              <Alert role="presentation">
                <CircleCheckIcon aria-hidden="true" />
                <AlertDescription>An action finished.</AlertDescription>
              </Alert>
            </output>
            <Alert variant="destructive">
              <CircleXIcon aria-hidden="true" />
              <AlertDescription>An action failed.</AlertDescription>
            </Alert>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <StickyNoteIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No notes yet.</EmptyTitle>
              </EmptyHeader>
              <EmptyContent>
                <EmptyDescription>
                  A description under a title.
                </EmptyDescription>
              </EmptyContent>
            </Empty>
            <output className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner aria-hidden="true" />
              {"Loading the notes…"}
            </output>
            <output
              aria-label="Loading the summary"
              className="grid w-full gap-2"
            >
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
            </output>
            <p className="text-sm text-muted-foreground">
              Written on 3 November
            </p>
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Recent notes
            </p>
          </CardContent>
        </Card>
      </section>

      <TabsExamples
        filter={state.filter}
        onFilterChange={(filter) => logic.chooseFilter(filter)}
      />

      <FieldExamples logic={logic} />
      <FormExamples logic={logic} />

      <ContainerExamples />
      <OverlayExamples logic={logic} />

      <section aria-label="Settings fields">
        <Card>
          <CardContent className="flex flex-col gap-3">
            <FieldSet>
              <FieldLegend>
                <h2>Notifications</h2>
              </FieldLegend>
              <FieldDescription>How the app reaches you.</FieldDescription>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Email summary</FieldTitle>
                  <FieldDescription>One email each week.</FieldDescription>
                </FieldContent>
                <Badge variant="outline">On</Badge>
              </Field>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Text messages</FieldTitle>
                </FieldContent>
                <Badge variant="secondary">Off</Badge>
              </Field>
            </FieldSet>
          </CardContent>
        </Card>
      </section>

      <IconExamples />
    </Page>
  );
}
