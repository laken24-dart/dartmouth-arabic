import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import App from "./App";
import "./styles.css";
import "./components.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <HashRouter>
        <App />
      </HashRouter>
    </MotionConfig>
  </React.StrictMode>
);
