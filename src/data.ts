import type { Dataset, Meta, NodeSeries, SensorNode, Series } from "./types";

export async function loadDataset(): Promise<Dataset> {
  const base = import.meta.env.BASE_URL;
  const [nodes, series, meta] = await Promise.all([
    fetch(`${base}data/nodes.json`).then((r) => r.json() as Promise<SensorNode[]>),
    fetch(`${base}data/series.json`).then((r) => r.json() as Promise<Series>),
    fetch(`${base}data/meta.json`).then((r) => r.json() as Promise<Meta>),
  ]);
  return { nodes, series, meta };
}

/**
 * Pulls one node's readings out of the columnar store.
 *
 * The data ships columnar because an array of 36k objects costs roughly three
 * times the bytes over the wire; the trade is this pivot on read.
 */
export function nodeSeries(series: Series, node: number): NodeSeries {
  const out: NodeSeries = {
    hours: [],
    temperature: [],
    humidity: [],
    light: [],
    voltage: [],
    tempDeviation: [],
    anomaly: [],
  };

  for (let i = 0; i < series.node.length; i++) {
    if (series.node[i] !== node) continue;
    out.hours.push(series.hours[series.hourIdx[i]]);
    out.temperature.push(series.temperature[i]);
    out.humidity.push(series.humidity[i]);
    out.light.push(series.light[i]);
    out.voltage.push(series.voltage[i]);
    out.tempDeviation.push(series.tempDeviation[i]);
    out.anomaly.push(series.anomaly[i]);
  }

  return out;
}

export interface FleetKpis {
  total: number;
  healthy: number;
  degraded: number;
  offline: number;
  totalAnomalies: number;
  medianCoverage: number;
  nodesBelowCriticalVoltage: number;
}

export function fleetKpis(nodes: SensorNode[], voltageCritical: number): FleetKpis {
  const coverage = nodes.map((n) => n.coveragePct).sort((a, b) => a - b);
  const mid = Math.floor(coverage.length / 2);

  return {
    total: nodes.length,
    healthy: nodes.filter((n) => n.status === "healthy").length,
    degraded: nodes.filter((n) => n.status === "degraded").length,
    offline: nodes.filter((n) => n.status === "offline").length,
    totalAnomalies: nodes.reduce((a, n) => a + n.anomalies, 0),
    medianCoverage:
      coverage.length === 0
        ? 0
        : coverage.length % 2 === 0
          ? (coverage[mid - 1] + coverage[mid]) / 2
          : coverage[mid],
    nodesBelowCriticalVoltage: nodes.filter(
      (n) => n.voltageLast !== null && n.voltageLast < voltageCritical
    ).length,
  };
}

/** Nodes most worth an operator's attention, worst first. */
export function triageNodes(nodes: SensorNode[]): SensorNode[] {
  const rank: Record<string, number> = { offline: 0, degraded: 1, healthy: 2 };
  return [...nodes].sort((a, b) => {
    const byStatus = rank[a.status] - rank[b.status];
    if (byStatus !== 0) return byStatus;
    return (b.anomalyRate ?? 0) - (a.anomalyRate ?? 0);
  });
}

export function formatNumber(n: number, digits = 0): string {
  return n.toLocaleString("es-CR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-CR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}
