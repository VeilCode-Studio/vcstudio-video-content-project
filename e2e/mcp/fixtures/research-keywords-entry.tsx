import { createRoot } from "react-dom/client";
import { ResearchKeywordsHarness } from "./ResearchKeywordsHarness";
document.documentElement.classList.toggle(
  "dark",
  new URLSearchParams(location.search).get("theme") === "dark",
);
createRoot(document.getElementById("root")!).render(
  <ResearchKeywordsHarness />,
);
