import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  err: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  componentDidCatch(err: Error, info: { componentStack?: string }): void {
    console.error("[mterminal] uncaught render error:", err, info.componentStack);
  }

  reset = (): void => {
    this.setState({ err: null });
  };

  render(): ReactNode {
    if (!this.state.err) return this.props.children;
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          gap: 12,
          background: "var(--bg-base, #100e0c)",
          color: "var(--fg, #efe7da)",
          fontFamily:
            'var(--font-mono, "Commit Mono", ui-monospace, monospace)',
          fontSize: 13,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600 }}>
          mTerminal hit a render error
        </div>
        <pre
          style={{
            maxWidth: 720,
            maxHeight: "60vh",
            overflow: "auto",
            background: "color-mix(in oklch, var(--err, #d76a55) 12%, transparent)",
            border: "1px solid color-mix(in oklch, var(--err, #d76a55) 40%, transparent)",
            borderRadius: 6,
            padding: "10px 14px",
            whiteSpace: "pre-wrap",
            textAlign: "left",
          }}
        >
          {this.state.err.message}
          {this.state.err.stack ? "\n\n" + this.state.err.stack : ""}
        </pre>
        <button
          type="button"
          onClick={this.reset}
          style={{
            padding: "6px 14px",
            background: "var(--accent, #d7693a)",
            color: "var(--on-accent, #fdfaf4)",
            border: 0,
            borderRadius: 6,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "inherit",
          }}
        >
          retry
        </button>
      </div>
    );
  }
}
