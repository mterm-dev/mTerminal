import { laneColor, type GraphRow } from "../lib/git-graph";

interface Props {
  row: GraphRow;
  rowHeight: number;
  laneWidth: number;
  totalLanes: number;
}

export function GraphCell({ row, rowHeight, laneWidth, totalLanes }: Props) {
  const width = Math.max(1, totalLanes) * laneWidth;
  const cy = rowHeight / 2;
  const xOf = (lane: number) => laneWidth / 2 + lane * laneWidth;

  return (
    <svg
      className="git-graph-cell"
      width={width}
      height={rowHeight}
      viewBox={`0 0 ${width} ${rowHeight}`}
      aria-hidden="true"
    >
      {row.passingLanes.map((lane) => (
        <line
          key={`p-${lane}`}
          x1={xOf(lane)}
          y1={0}
          x2={xOf(lane)}
          y2={rowHeight}
          stroke={laneColor(lane)}
          strokeWidth={1.5}
        />
      ))}
      {row.edges.map((edge, i) => {
        const x1 = xOf(edge.fromLane);
        const x2 = xOf(edge.toLane);
        if (x1 === x2) {
          return (
            <line
              key={i}
              x1={x1}
              y1={cy}
              x2={x2}
              y2={rowHeight}
              stroke={laneColor(edge.toLane)}
              strokeWidth={1.5}
            />
          );
        }
        const midY = cy + (rowHeight - cy) * 0.5;
        return (
          <path
            key={i}
            d={`M ${x1} ${cy} L ${x1} ${midY} L ${x2} ${midY + (rowHeight - midY) * 0} L ${x2} ${rowHeight}`}
            stroke={laneColor(edge.toLane)}
            strokeWidth={1.5}
            fill="none"
          />
        );
      })}
      <circle
        cx={xOf(row.lane)}
        cy={cy}
        r={4}
        fill={laneColor(row.lane)}
        stroke="var(--bg, #111)"
        strokeWidth={1.2}
      />
    </svg>
  );
}
