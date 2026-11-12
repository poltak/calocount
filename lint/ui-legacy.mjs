export const legacyUi = {
  // Phase 2 replaces this control with shadcn collapsible.
  "features/core/ui/components/disclosure.tsx": {
    imports: ["@base-ui/react/collapsible"],
  },
  // Phase 2 replaces this control with shadcn dialog.
  "features/core/ui/components/dialog.tsx": {
    imports: ["@base-ui/react/dialog"],
  },
};
