import type { ReactNode } from "react";

export function Page({ children }: { children: ReactNode }) {
  return (
    <div
      data-slot="page"
      className="mx-auto w-full min-w-0 max-w-(--width-page) px-4 pt-6 pb-8 in-data-[slot=sidebar-inset]:max-w-(--width-content) in-data-[slot=sidebar-inset]:px-3 in-data-[slot=sidebar-inset]:pt-0 md:in-data-[slot=sidebar-inset]:px-8"
    >
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </div>
  );
}
