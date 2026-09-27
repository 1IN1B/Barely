/**
 * Renderer entry point. Mounts <App/> and imports the overlay stylesheet.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "../styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("[barely] #root container missing");

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
