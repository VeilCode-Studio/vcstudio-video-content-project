import { createRoot } from "react-dom/client";
import { PostMediaViewerHarness } from "./PostMediaViewerHarness";
const root = document.getElementById("root");
if (root) createRoot(root).render(<PostMediaViewerHarness />);
