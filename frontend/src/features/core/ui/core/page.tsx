import type { ReactNode } from "react";
import { cn } from "cn";

export function Page({
  children,
  variant = "page",
}: {
  children: ReactNode;
  variant?: "page" | "notice";
}) {
  return (
    <div
      data-slot="page"
      className={cn(
        "mx-auto w-full min-w-0 max-w-(--width-page) px-4 pt-6 in-data-[slot=sidebar-inset]:max-w-(--width-content) in-data-[slot=sidebar-inset]:px-3 in-data-[slot=sidebar-inset]:pt-0 md:in-data-[slot=sidebar-inset]:px-8",
        variant === "notice" ? "pb-0" : "pb-8",
      )}
    >
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </div>
  );
}
