import "../globals.css";
import { mountDashboard } from "./dashboard";

// The server sends the page with the loading state already in it. The dashboard or the sign-in page takes it over from here.
const root = document.querySelector<HTMLElement>("main[data-view]");
if (root?.dataset.view === "sign-in") {
  void import("./sign-in").then(({ mountSignIn }) => mountSignIn(root));
} else if (root) {
  const publicView = root.dataset.view === "public";
  mountDashboard(root, { publicView, readOnly: publicView });
}
