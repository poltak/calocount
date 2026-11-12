export const legacyUi = {
  // Phase 2 replaces this control with shadcn collapsible.
  "features/core/ui/components/disclosure.tsx": {
    imports: ["@base-ui/react/collapsible"],
  },
  // Phase 2 replaces this control with shadcn dialog.
  "features/core/ui/components/dialog.tsx": {
    imports: ["@base-ui/react/dialog"],
  },
  // Phase 2 replaces these badge tones with shadcn badge variants.
  "features/core/ui/components/badge.tsx": {
    classes: [
      "text-[var(--color-link)]",
      "bg-[var(--color-success-soft)]",
      "bg-[var(--color-notice-background)]",
      "text-[var(--color-notice-text)]",
      "bg-[var(--color-danger-soft)]",
    ],
  },
  // Phase 2 replaces this control and its transition with shadcn button.
  "features/core/ui/components/button.tsx": {
    imports: ["@base-ui/react/button"],
    classes: ["transition-[color,background-color,border-color,box-shadow]"],
  },
  // Phase 2 replaces this control with shadcn dropdown-menu.
  "features/core/ui/components/menu.tsx": { imports: ["@base-ui/react/menu"] },
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
  // Phase 2 replaces this control with shadcn tabs.
  "features/core/ui/components/tabs.tsx": { imports: ["@base-ui/react/tabs"] },
};
