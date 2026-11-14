import { createRoot } from "react-dom/client";
import { ResearchHarness } from "./ResearchHarness";
document.documentElement.classList.toggle(
  "dark",
  new URLSearchParams(location.search).get("theme") === "dark",
);
createRoot(document.getElementById("root")!).render(<ResearchHarness />);
