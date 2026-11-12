# Text and page layout

Errors use `Alert variant="destructive"`, which announces the message at once.
For a polite message, put `Alert role="presentation"` inside a native
`output`. The output retains the status role without a second live region.
Use `InfoIcon`, `TriangleAlertIcon`, or `CircleCheckIcon` to explain the
message. Use the default generated appearance, not old tone colors.
An action stays inside `AlertDescription`, after its message.

Settings use `FieldSet` and `FieldLegend` with a semantic heading. Use
`Field orientation="horizontal"` and `FieldContent` for text beside a
control. Connect `FieldLabel` to the control. The gallery has read-only
badges, so those rows use `FieldTitle` rather than an unconnected label.
No caller used the old scroll highlight, so it is gone.

`AppLayout` composes the sidebar parts from the `sidebar-07` block. It uses
`SidebarProvider`, `Sidebar`, `SidebarHeader`, `SidebarContent`,
`SidebarGroup`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`,
`SidebarFooter`, `SidebarInset`, and `SidebarTrigger`. The router sets
`isActive` and `aria-current` on link buttons. Link activation closes the
phone sheet. A keyboard user can open it with the trigger and close it
with Escape, which returns focus to the trigger. Signing out closes it too.
The banner keeps the brand, user name, and sign-out action. The inset is
the main landmark. Desktop navigation can collapse with the same trigger.
