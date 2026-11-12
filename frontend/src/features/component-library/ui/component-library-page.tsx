import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../core/ui/shadcn/card.js";
import { Page } from "../../core/ui/components/layout.js";
import { Loading } from "../../core/ui/components/loading.js";
import { PageHeader } from "../../core/ui/components/page-header.js";
import {
  SettingGroup,
  SettingRow,
} from "../../core/ui/components/setting-list.js";
import { EmptyState, Notice, Text } from "../../core/ui/components/text.js";
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

      <section aria-label="Badge, Notice, EmptyState, Loading, Text">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Badge, Notice, EmptyState, Loading, Text</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
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

      <section aria-label="SettingGroup, SettingRow">
        <Card>
          <CardContent className="flex flex-col gap-3">
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
          </CardContent>
        </Card>
      </section>

      <IconExamples />
    </Page>
  );
}
