export function About() {
  return (
    <div className="settings-about">
      <div className="settings-about-name">mTerminal</div>
      <div className="settings-about-ver">v0.1.0</div>
      <p>Custom terminal emulator with grouped tabs.</p>
      <p className="dim">
        Built with Electron · React 19 · xterm.js · node-pty.
      </p>
      <p className="dim">
        <a
          href="https://github.com/arthurr0/mTerminal"
          target="_blank"
          rel="noreferrer"
        >
          github.com/arthurr0/mTerminal
        </a>
      </p>
    </div>
  );
}
