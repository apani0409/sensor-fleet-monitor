import type { NodeStatus, SensorNode } from "../types";

const STATUS_COLOR: Record<NodeStatus, string> = {
  healthy: "#16a34a",
  degraded: "#f59e0b",
  offline: "#dc2626",
};

interface Props {
  nodes: SensorNode[];
  selected: number | null;
  onSelect: (node: number) => void;
  colorBy?: "status" | "cluster";
}

const CLUSTER_COLOR = ["#2563eb", "#7c3aed", "#0891b2", "#db2777"];

/**
 * Floor plan of the deployment, drawn from the real mote coordinates that
 * ship with the dataset. Position carries meaning here: neighbouring nodes
 * should agree, so a node that disagrees with the ones around it is the
 * interesting case.
 */
export function NodeMap({ nodes, selected, onSelect, colorBy = "status" }: Props) {
  const placed = nodes.filter((n) => n.x !== null && n.y !== null);
  if (placed.length === 0) return null;

  const xs = placed.map((n) => n.x as number);
  const ys = placed.map((n) => n.y as number);
  const pad = 3;
  const minX = Math.min(...xs) - pad;
  const maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad;
  const maxY = Math.max(...ys) + pad;
  const width = maxX - minX;
  const height = maxY - minY;

  return (
    <div className="node-map">
      <svg viewBox={`${minX} ${minY} ${width} ${height}`} role="img" aria-label="Mapa de nodos">
        <rect
          x={minX}
          y={minY}
          width={width}
          height={height}
          fill="var(--surface-2)"
          stroke="var(--border)"
          strokeWidth={0.15}
          rx={0.6}
        />
        {placed.map((n) => {
          const isSelected = n.node === selected;
          const fill =
            colorBy === "cluster"
              ? CLUSTER_COLOR[(n.cluster ?? 0) % CLUSTER_COLOR.length]
              : STATUS_COLOR[n.status];
          return (
            <g key={n.node} onClick={() => onSelect(n.node)} className="node-dot">
              <circle
                cx={n.x as number}
                cy={n.y as number}
                r={isSelected ? 1.5 : 1.05}
                fill={fill}
                stroke={isSelected ? "var(--text)" : "white"}
                strokeWidth={isSelected ? 0.35 : 0.18}
              />
              <text
                x={n.x as number}
                y={(n.y as number) + 0.33}
                textAnchor="middle"
                fontSize={0.85}
                fill="white"
                pointerEvents="none"
              >
                {n.node}
              </text>
              <title>
                {`Nodo ${n.node} · ${n.status} · cobertura ${n.coveragePct}% · ${n.anomalies} anomalías`}
              </title>
            </g>
          );
        })}
      </svg>
      <div className="map-legend">
        {colorBy === "status"
          ? (["healthy", "degraded", "offline"] as NodeStatus[]).map((s) => (
              <span key={s}>
                <i style={{ background: STATUS_COLOR[s] }} />
                {s === "healthy" ? "Sano" : s === "degraded" ? "Degradado" : "Sin señal"}
              </span>
            ))
          : CLUSTER_COLOR.map((c, i) => (
              <span key={c}>
                <i style={{ background: c }} />
                Grupo {i + 1}
              </span>
            ))}
      </div>
    </div>
  );
}
