import type { NodeStatus } from "../types";

const LABEL: Record<NodeStatus, string> = {
  healthy: "Sano",
  degraded: "Degradado",
  offline: "Sin señal",
};

export function StatusBadge({ status }: { status: NodeStatus }) {
  return <span className={`status status-${status}`}>{LABEL[status]}</span>;
}
