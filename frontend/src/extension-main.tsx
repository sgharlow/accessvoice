import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/accessibility.css";

// Signal to hooks that we're in extension mode
(window as any).__ACCESSVOICE_EXTENSION__ = true;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
