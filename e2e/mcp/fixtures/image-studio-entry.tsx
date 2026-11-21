import { createRoot } from "react-dom/client";
import { ImageStudioHarness } from "./ImageStudioHarness";
const root = document.getElementById("root");
if (root) createRoot(root).render(<ImageStudioHarness />);
