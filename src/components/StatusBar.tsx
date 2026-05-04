import { Clock } from "./Clock";

interface Props {
  activeLabel: string;
  cwd?: string;
  cmd?: string;
  tabCount: number;
  groupCount: number;
  aiUsage?: { inTokens: number; outTokens: number; costUsd: number };
}

export function StatusBar({
  activeLabel,
  cwd,
  cmd,
  tabCount,
  groupCount,
  aiUsage,
}: Props) {
  return (
    <div className="term-status">
      <div className="seg" title={activeLabel}>
        {activeLabel.toUpperCase()}
      </div>
      {cwd && (
        <div className="seg shrink" title={cwd}>
          {shortenCwd(cwd)}
        </div>
      )}
      {cmd && <div className="seg" title={cmd}>{cmd}</div>}
      <div className="seg">UTF-8</div>
      <div className="grow" />
      <div className="seg">
        {tabCount} tab{tabCount === 1 ? "" : "s"} · {groupCount} group
        {groupCount === 1 ? "" : "s"}
      </div>
      {aiUsage && (aiUsage.inTokens > 0 || aiUsage.outTokens > 0) && (
        <div
          className="ai-usage"
          title={`in: ${aiUsage.inTokens} · out: ${aiUsage.outTokens} · $${aiUsage.costUsd.toFixed(4)}`}
        >
          ai <strong>${aiUsage.costUsd.toFixed(3)}</strong>
        </div>
      )}
      <div className="clock-seg">
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
