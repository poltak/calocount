import {
  DASHBOARD_SECTIONS,
  type DashboardSection,
} from "./dashboard-logic.js";
import { useDashboard } from "./dashboard-context.js";

const LABELS: Record<DashboardSection, string> = {
  today: "Today",
  meals: "Entries",
  trend: "Trend",
  macros: "Macros",
  nutrition: "Nutrition",
};

/** Links to the parts of the page. The stylesheet shows them on a small screen. */
export function SectionTabs() {
  const { dashboard } = useDashboard();
  return (
    <nav className="jump-nav" aria-label="Dashboard sections">
      {DASHBOARD_SECTIONS.map((section) => {
        const active = dashboard.state.activeSection === section;
        return (
          <a
            key={section}
            className={active ? "active" : ""}
            href={`#${section}`}
            aria-current={active ? "page" : undefined}
          >
            {LABELS[section]}
          </a>
        );
      })}
    </nav>
  );
}
