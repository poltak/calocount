import { mountSignIn } from "../../../app/ui/sign-in";
import "../../../app/globals.css";

// The server writes these attributes into the real page. The test gives them in the query.
const root = document.querySelector<HTMLElement>("main")!;
const query = new URLSearchParams(location.search);
root.dataset.returnTo = query.get("returnTo") ?? "/";
if (query.has("notice")) root.dataset.notice = query.get("notice")!;
mountSignIn(root);
