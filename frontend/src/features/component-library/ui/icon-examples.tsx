import {
  StickyNote,
  LayoutGrid,
  Settings,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
  X,
  Check,
  CornerDownLeft,
  Search,
  Info,
  TriangleAlert,
  CircleX,
  CircleCheck,
  ExternalLink,
  Download,
  Copy,
  Pencil,
  Trash2,
  RefreshCw,
  MoreHorizontal,
  Clock,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "../../core/ui/shadcn/card.js";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "../../core/ui/shadcn/item.js";

export function IconExamples() {
  return (
    <section aria-label="Icons">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Icons</h2>
          </CardTitle>
          <CardDescription>Each icon has one meaning.</CardDescription>
        </CardHeader>
        <CardContent>
          <ItemGroup
            aria-label="Icons"
            className="grid grid-cols-1 md:grid-cols-4"
          >
            <Item render={<li />} variant="muted">
              <ItemMedia variant="icon">
                <StickyNote aria-hidden="true" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>notes</ItemTitle>
                <ItemDescription className="line-clamp-none">
                  Goes to the notes.
                </ItemDescription>
              </ItemContent>
            </Item>
            <Item render={<li />} variant="muted">
              <ItemMedia variant="icon">
                <LayoutGrid aria-hidden="true" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>components</ItemTitle>
                <ItemDescription className="line-clamp-none">
                  Goes to the component library.
                </ItemDescription>
              </ItemContent>
            </Item>
            <Item render={<li />} variant="muted">
              <ItemMedia variant="icon">
                <Settings aria-hidden="true" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>settings</ItemTitle>
                <ItemDescription className="line-clamp-none">
                  Goes to the settings.
                </ItemDescription>
              </ItemContent>
            </Item>
            <Item render={<li />} variant="muted">
              <ItemMedia variant="icon">
                <ChevronDown aria-hidden="true" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>chevron-down</ItemTitle>
                <ItemDescription className="line-clamp-none">
                  Opens a menu or a select.
                </ItemDescription>
              </ItemContent>
            </Item>
            <Item render={<li />} variant="muted">
              <ItemMedia variant="icon">
                <ChevronLeft aria-hidden="true" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>chevron-left</ItemTitle>
                <ItemDescription className="line-clamp-none">
                  Goes back, or shows earlier tabs.
                </ItemDescription>
              </ItemContent>
            </Item>
            <Item render={<li />} variant="muted">
              <ItemMedia variant="icon">
                <ChevronRight aria-hidden="true" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>chevron-right</ItemTitle>
                <ItemDescription className="line-clamp-none">
                  Opens a closed part, such as a Disclosure, or shows later
                  tabs.
                </ItemDescription>
              </ItemContent>
            </Item>
            <Item render={<li />} variant="muted">
              <ItemMedia variant="icon">
                <Plus aria-hidden="true" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>plus</ItemTitle>
                <ItemDescription className="line-clamp-none">
                  Adds an item, or zooms in.
                </ItemDescription>
              </ItemContent>
            </Item>
            <Item render={<li />} variant="muted">
              <ItemMedia variant="icon">
                <Minus aria-hidden="true" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>minus</ItemTitle>
                <ItemDescription className="line-clamp-none">
                  Zooms out, or takes a part away.
                </ItemDescription>
              </ItemContent>
            </Item>
            <Item render={<li />} variant="muted">
              <ItemMedia variant="icon">
                <X aria-hidden="true" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>close</ItemTitle>
                <ItemDescription className="line-clamp-none">
                  Closes a dialog or a panel, or takes a chip away.
                </ItemDescription>
              </ItemContent>
            </Item>
            <Item render={<li />} variant="muted">
              <ItemMedia variant="icon">
                <Check aria-hidden="true" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>check</ItemTitle>
                <ItemDescription className="line-clamp-none">
                  Done, or chosen.
                </ItemDescription>
              </ItemContent>
            </Item>
            <Item render={<li />} variant="muted">
              <ItemMedia variant="icon">
                <CornerDownLeft aria-hidden="true" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>enter</ItemTitle>
                <ItemDescription className="line-clamp-none">
                  Saves a field, as the Enter key does.
                </ItemDescription>
              </ItemContent>
            </Item>
            <Item render={<li />} variant="muted">
              <ItemMedia variant="icon">
                <Search aria-hidden="true" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>search</ItemTitle>
                <ItemDescription className="line-clamp-none">
                  Searches a list.
                </ItemDescription>
              </ItemContent>
            </Item>
            <Item render={<li />} variant="muted">
              <ItemMedia variant="icon">
                <Info aria-hidden="true" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>info</ItemTitle>
                <ItemDescription className="line-clamp-none">
                  A fact to know. The icon of an info Alert.
                </ItemDescription>
              </ItemContent>
            </Item>
            <Item render={<li />} variant="muted">
              <ItemMedia variant="icon">
                <TriangleAlert aria-hidden="true" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>warning</ItemTitle>
                <ItemDescription className="line-clamp-none">
                  Needs a look. The icon of a warning Alert.
                </ItemDescription>
              </ItemContent>
            </Item>
            <Item render={<li />} variant="muted">
              <ItemMedia variant="icon">
                <CircleX aria-hidden="true" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>error</ItemTitle>
                <ItemDescription className="line-clamp-none">
                  Failed. The icon of an error Alert and of a field error.
                </ItemDescription>
              </ItemContent>
            </Item>
            <Item render={<li />} variant="muted">
              <ItemMedia variant="icon">
                <CircleCheck aria-hidden="true" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>success</ItemTitle>
                <ItemDescription className="line-clamp-none">
                  Finished well. The icon of a success Alert.
                </ItemDescription>
              </ItemContent>
            </Item>
            <Item render={<li />} variant="muted">
              <ItemMedia variant="icon">
                <ExternalLink aria-hidden="true" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>external</ItemTitle>
                <ItemDescription className="line-clamp-none">
                  Opens in a new tab, or on another site.
                </ItemDescription>
              </ItemContent>
            </Item>
            <Item render={<li />} variant="muted">
              <ItemMedia variant="icon">
                <Download aria-hidden="true" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>download</ItemTitle>
                <ItemDescription className="line-clamp-none">
                  Saves a file to the computer.
                </ItemDescription>
              </ItemContent>
            </Item>
            <Item render={<li />} variant="muted">
              <ItemMedia variant="icon">
                <Copy aria-hidden="true" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>copy</ItemTitle>
                <ItemDescription className="line-clamp-none">
                  Copies text or a file to the clipboard.
                </ItemDescription>
              </ItemContent>
            </Item>
            <Item render={<li />} variant="muted">
              <ItemMedia variant="icon">
                <Pencil aria-hidden="true" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>edit</ItemTitle>
                <ItemDescription className="line-clamp-none">
                  Edits an item.
                </ItemDescription>
              </ItemContent>
            </Item>
            <Item render={<li />} variant="muted">
              <ItemMedia variant="icon">
                <Trash2 aria-hidden="true" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>trash</ItemTitle>
                <ItemDescription className="line-clamp-none">
                  Removes an item.
                </ItemDescription>
              </ItemContent>
            </Item>
            <Item render={<li />} variant="muted">
              <ItemMedia variant="icon">
                <RefreshCw aria-hidden="true" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>refresh</ItemTitle>
                <ItemDescription className="line-clamp-none">
                  Makes a part again from the data as it is now.
                </ItemDescription>
              </ItemContent>
            </Item>
            <Item render={<li />} variant="muted">
              <ItemMedia variant="icon">
                <MoreHorizontal aria-hidden="true" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>more</ItemTitle>
                <ItemDescription className="line-clamp-none">
                  Opens more actions.
                </ItemDescription>
              </ItemContent>
            </Item>
            <Item render={<li />} variant="muted">
              <ItemMedia variant="icon">
                <Clock aria-hidden="true" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>clock</ItemTitle>
                <ItemDescription className="line-clamp-none">
                  Shows a history.
                </ItemDescription>
              </ItemContent>
            </Item>
          </ItemGroup>
        </CardContent>
      </Card>
    </section>
  );
}
