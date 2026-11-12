import { Fragment } from "react";
import { PencilIcon, PlusIcon } from "lucide-react";
import { Badge } from "../../core/ui/shadcn/badge.js";
import { Button } from "../../core/ui/shadcn/button.js";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../core/ui/shadcn/card.js";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "../../core/ui/shadcn/item.js";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../core/ui/shadcn/table.js";

const INVOICES = [
  { id: "1", name: "Invoice 1042", amount: "$120.00", overdue: false },
  { id: "2", name: "Invoice 1043", amount: "$89.50", overdue: true },
  { id: "3", name: "Invoice 1044", amount: "$310.00", overdue: false },
] as const;

export function ContainerExamples() {
  return (
    <section aria-label="Card, Item, Table">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Card, Item, Table</h2>
          </CardTitle>
          <CardDescription>Lists and tables on one surface.</CardDescription>
          <CardAction>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{INVOICES.length}</Badge>
              <Button size="sm" variant="outline">
                <PlusIcon /> Add
              </Button>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ItemGroup aria-label="Example list">
            <Item render={<li />}>
              <ItemContent>
                <ItemTitle>
                  Invoice 1042 <Badge variant="outline">Paid</Badge>
                </ItemTitle>
                <ItemDescription>Sent to Ada Lovelace</ItemDescription>
              </ItemContent>
              <ItemActions>
                <span>3 Nov</span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Edit invoice 1042"
                  title="Edit invoice 1042"
                >
                  <PencilIcon />
                </Button>
              </ItemActions>
            </Item>
            <ItemSeparator />
            <Item render={<li />}>
              <ItemContent>
                <ItemTitle>
                  Invoice 1043 <Badge variant="destructive">Overdue</Badge>
                </ItemTitle>
              </ItemContent>
              <ItemActions>25 Oct</ItemActions>
            </Item>
          </ItemGroup>
          <ItemGroup role="presentation">
            {[
              { label: "Owner", value: "Ada Lovelace" },
              { label: "Plan", value: "Team" },
            ].map((entry, index) => (
              <Fragment key={entry.label}>
                {index > 0 && <ItemSeparator />}
                <Item render={<dl />}>
                  <ItemContent>
                    <dt>{entry.label}</dt>
                    <dd>{entry.value}</dd>
                  </ItemContent>
                </Item>
              </Fragment>
            ))}
          </ItemGroup>
          <Table>
            <TableCaption>Example invoices</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Invoice</TableHead>
                <TableHead scope="col" className="text-right">
                  Amount
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {INVOICES.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>{invoice.name}</TableCell>
                  <TableCell
                    className={
                      invoice.overdue
                        ? "text-right font-semibold text-destructive"
                        : "text-right font-semibold"
                    }
                  >
                    {invoice.amount}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        <CardFooter>Amounts are in US dollars.</CardFooter>
      </Card>
    </section>
  );
}
