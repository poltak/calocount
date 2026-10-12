import { mountDashboard } from "../../../app/ui/dashboard";
import "../../../app/globals.css";

const publicView = new URLSearchParams(location.search).has("public");
mountDashboard(document.querySelector<HTMLElement>("main")!, { publicView, readOnly: publicView });
