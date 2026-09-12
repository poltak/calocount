import { createRoot } from "react-dom/client";
import { Dashboard } from "../../../app/page";
import "../../../app/globals.css";

const publicView = new URLSearchParams(location.search).has("public");
createRoot(document.getElementById("root")!).render(<Dashboard publicView={publicView} readOnly={publicView} />);
