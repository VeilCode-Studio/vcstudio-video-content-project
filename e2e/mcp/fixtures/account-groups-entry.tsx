import { createRoot } from "react-dom/client";
import { AccountGroupsHarness } from "./AccountGroupsHarness";
document.documentElement.classList.toggle(
  "dark",
  new URLSearchParams(location.search).get("theme") === "dark",
);
createRoot(document.getElementById("root")!).render(<AccountGroupsHarness />);
