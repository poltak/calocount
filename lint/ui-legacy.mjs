export const legacyUi = {
  // Phase 2 replaces this control with shadcn collapsible.
  "features/core/ui/components/disclosure.tsx": {
    imports: ["@base-ui/react/collapsible"],
  },
  // Phase 2 replaces this control with shadcn dialog.
  "features/core/ui/components/dialog.tsx": {
    imports: ["@base-ui/react/dialog"],
  },
  // Phase 2 replaces these controls with shadcn field and its input parts.
  "features/core/ui/components/field.tsx": {
    imports: [
      "@base-ui/react/checkbox",
      "@base-ui/react/field",
      "@base-ui/react/input",
      "@base-ui/react/radio",
      "@base-ui/react/radio-group",
      "@base-ui/react/select",
    ],
  },
};
