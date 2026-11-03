import type { ReactNode } from "react";
import { Link } from "react-router";
import "./components.css";
import { Button } from "./button.js";
import { NavTabs, type NavTabItem } from "./tabs.js";
import { Text } from "./text.js";

/**
 * The frame of each signed-in page: the sidebar, and the page beside it. The
 * sidebar is the `header` of the document, so it has the banner role.
 */
export function AppLayout({
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
}: {
  home: string;
  brand: string;
  navLabel: string;
  nav: readonly NavTabItem[];
  accountNav?: readonly NavTabItem[] | undefined;
  userName: string | null | undefined;
  signingOut: boolean;
  onSignOut: () => void;
  /** A message over the page, such as a failed sign-out. */
  notice?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="ui-app">
      <header className="ui-sidebar">
        <Link className="ui-sidebar-brand" to={home}>
          {brand}
        </Link>
        <NavTabs label={navLabel} variant="sidebar" items={nav} />
        <div className="ui-sidebar-foot">
          {accountNav && (
            <NavTabs label="Account" variant="sidebar" items={accountNav} />
          )}
          <div className="ui-sidebar-user">
            <Text as="span" variant="meta">
              {userName}
            </Text>
            <Button
              size="sm"
              variant="ghost"
              busy={signingOut}
              onClick={onSignOut}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="ui-app-main">
        {notice}
        {children}
      </main>
    </div>
  );
}
