import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import "@xterm/xterm/css/xterm.css";
import "./styles/theme.css";
import "./styles/syntax.css";
import "./styles/toast.css";
import "./styles/update-banner.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
