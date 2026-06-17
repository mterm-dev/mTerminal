import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import "@fontsource-variable/bricolage-grotesque/index.css";
import "@fontsource-variable/hanken-grotesk/index.css";
import "@fontsource/commit-mono/400.css";
import "@fontsource/commit-mono/700.css";
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
