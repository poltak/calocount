import { mountDashboard } from "../../../app/ui/dashboard";
import "../../../app/globals.css";

const search = new URLSearchParams(location.search);
const publicView = search.has("public");
// The fixture serves one page, so `?partner` stands in for the /owner/partner path.
mountDashboard(document.querySelector<HTMLElement>("main")!, { publicView, readOnly: publicView, profile: search.has("partner") ? "partner" : "owner" });
