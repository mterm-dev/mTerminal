import { Clock } from "./Clock";

interface Props {
  activeLabel: string;
  cwd?: string;
  cmd?: string;
  tabCount: number;
  groupCount: number;
}

export function StatusBar({
  activeLabel,
  cwd,
  cmd,
  tabCount,
  groupCount,
}: Props) {
  return (
    <div className="term-status">
      <div className="seg">{activeLabel.toUpperCase()}</div>
      {cwd && <div className="seg" title={cwd}>{shortenCwd(cwd)}</div>}
      {cmd && <div className="seg">{cmd}</div>}
      <div className="seg">UTF-8</div>
      <div className="grow" />
      <div className="seg">
        {tabCount} tab{tabCount === 1 ? "" : "s"} · {groupCount} group
        {groupCount === 1 ? "" : "s"}
      </div>
      <div style={{ padding: "0 12px" }}>
        <Clock />
      </div>
    </div>
  );
}

function shortenCwd(p: string): string {
  const home = (window as unknown as { __MT_HOME?: string }).__MT_HOME;
  if (home && p === home) return "~";
  if (home && p.startsWith(home + "/")) return "~" + p.slice(home.length);
  if (p.length > 40) {
    const parts = p.split("/").filter(Boolean);
    if (parts.length > 3) return "/" + parts.slice(-3).join("/");
  }
  return p;
}
