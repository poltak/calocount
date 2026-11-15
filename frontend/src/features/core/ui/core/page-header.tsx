import type { ReactNode } from "react";
import { CardHeader } from "../shadcn/card.js";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header>
      <CardHeader className="flex flex-wrap items-start justify-between gap-4 p-0">
        <div className="min-w-0">
          <h1 className="text-2xl leading-(--leading-page-title) font-semibold text-balance">
            {title}
          </h1>
          {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </CardHeader>
    </header>
  );
}
