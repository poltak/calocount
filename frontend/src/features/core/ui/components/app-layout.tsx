import type { ReactNode } from "react";
import { Link } from "react-router";
import { LogOutIcon } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "../shadcn/sidebar.js";
import { Spinner } from "../shadcn/spinner.js";
import "./components.css";

interface AppLayoutProps {
  home: string;
  brand: string;
  navLabel: string;
  nav: ReactNode;
  accountNav?: ReactNode;
  userName: string | null | undefined;
  signingOut: boolean;
  onSignOut: () => void;
  notice?: ReactNode;
  children: ReactNode;
}

export function AppLayout(props: AppLayoutProps) {
  return (
    <SidebarProvider>
      <AppFrame {...props} />
    </SidebarProvider>
  );
}

function AppFrame({
  home,
  brand,
  navLabel,
  nav,
  accountNav,
  userName,
  signingOut,
  onSignOut,
  notice,
  children,
}: AppLayoutProps) {
  const { setOpenMobile } = useSidebar();
  return (
    <>
      <Sidebar>
        <header className="flex min-h-0 flex-1 flex-col">
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<Link to={home} />}
                  onClick={() => setOpenMobile(false)}
                >
                  {brand}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <nav aria-label={navLabel}>{nav}</nav>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            {accountNav && <nav aria-label="Account">{accountNav}</nav>}
            <p className="truncate text-sm text-muted-foreground">{userName}</p>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  disabled={signingOut}
                  aria-busy={signingOut || undefined}
                  onClick={() => {
                    setOpenMobile(false);
                    onSignOut();
                  }}
                >
                  {signingOut ? (
                    <Spinner aria-hidden="true" />
                  ) : (
                    <LogOutIcon aria-hidden="true" />
                  )}
                  Sign out
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </header>
      </Sidebar>
      <SidebarInset className="min-w-0">
        <div className="flex items-center gap-2 p-3 md:px-8 md:pt-6">
          <SidebarTrigger />
          <span className="text-sm text-muted-foreground">{brand}</span>
        </div>
        <div className="ui-app-content flex flex-col gap-4">
          {notice}
          {children}
        </div>
      </SidebarInset>
    </>
  );
}
