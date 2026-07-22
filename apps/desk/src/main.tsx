import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./flow-rail.css";
import "./styles-chain-patch.css";
import "./styles-intent-log.css";
import "./styles-drop-rank.css";
import "./styles-latency-panel.css";
import "./styles-stream-v2.css";
import "./styles-wire-term.css";
import "./styles-pipeline-wire.css";
import "./styles-pipeline-hud.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
