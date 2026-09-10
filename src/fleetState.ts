import type { NodeStatus, SensorNode, Series } from "./types";

export interface NodeStateAt {
  node: number;
  status: NodeStatus;
  hoursSilent: number;
  /** null once the node has gone silent for good. */
  temperature: number | null;
  voltage: number | null;
  tempDeviation: number | null;
  anomaliesLast24h: number;
  invalidLast24h: number;
  reportedHours: number;
}

const SILENT_HOURS_OFFLINE = 24;
const RECENT_WINDOW = 24;

/** Per-node index into the series, built once and reused across scrubbing. */
export interface SeriesIndex {
  /** node -> row indices, ascending by hour. */
  rowsByNode: Map<number, number[]>;
}

export function buildSeriesIndex(series: Series): SeriesIndex {
  const rowsByNode = new Map<number, number[]>();
  for (let i = 0; i < series.node.length; i++) {
    const list = rowsByNode.get(series.node[i]);
    if (list) list.push(i);
    else rowsByNode.set(series.node[i], [i]);
  }
  for (const rows of rowsByNode.values()) {
    rows.sort((a, b) => series.hourIdx[a] - series.hourIdx[b]);
  }
  return { rowsByNode };
}

/**
 * Fleet state as it stood at a given hour.
 *
 * The dataset is a historical record, so "current status" is only meaningful
 * relative to a chosen moment. Judging every node against the very last hour
 * of the deployment marks almost the whole fleet offline, which is technically
 * true and operationally useless — by then the batteries were long gone.
 */
export function fleetStateAt(
  series: Series,
  index: SeriesIndex,
  nodes: SensorNode[],
  asOfIdx: number,
  voltageCritical: number
): NodeStateAt[] {
  return nodes.map((node) => {
    const rows = index.rowsByNode.get(node.node) ?? [];

    let lastRow = -1;
    let reportedHours = 0;
    let anomaliesLast24h = 0;
    let invalidLast24h = 0;

    for (const row of rows) {
      const hourIdx = series.hourIdx[row];
      if (hourIdx > asOfIdx) break;
      lastRow = row;
      reportedHours++;
      if (hourIdx > asOfIdx - RECENT_WINDOW) {
        anomaliesLast24h += series.anomaly[row];
        invalidLast24h += series.invalid[row];
      }
    }

    if (lastRow === -1) {
      return {
        node: node.node,
        status: "offline",
        hoursSilent: asOfIdx,
        temperature: null,
        voltage: null,
        tempDeviation: null,
        anomaliesLast24h: 0,
        invalidLast24h: 0,
        reportedHours: 0,
      };
    }

    const hoursSilent = asOfIdx - series.hourIdx[lastRow];
    const voltage = series.voltage[lastRow];
    // A null temperature on a row that exists means the node transmitted, but
    // every reading that hour was outside physical bounds. Still broadcasting,
    // just no longer measuring anything.
    const reportingGarbage = series.temperature[lastRow] === null;

    let status: NodeStatus = "healthy";
    if (hoursSilent >= SILENT_HOURS_OFFLINE) {
      status = "offline";
    } else if (
      reportingGarbage ||
      (voltage !== null && voltage < voltageCritical) ||
      invalidLast24h > 0 ||
      anomaliesLast24h > 0 ||
      hoursSilent >= 3
    ) {
      status = "degraded";
    }

    return {
      node: node.node,
      status,
      hoursSilent,
      temperature: series.temperature[lastRow],
      voltage,
      tempDeviation: series.tempDeviation[lastRow],
      anomaliesLast24h,
      invalidLast24h,
      reportedHours,
    };
  });
}

/**
 * A default "as of" worth landing on: the last hour where most of the fleet
 * was still producing usable measurements.
 *
 * Anchored on healthy nodes rather than merely active ones — by late March
 * most of the fleet is still transmitting but no longer measuring anything,
 * so "active" would land the visitor on a wall of failures.
 */
export function defaultAsOfIdx(healthyNodes: number[]): number {
  const peak = Math.max(...healthyNodes);
  const threshold = peak * 0.6;
  for (let i = healthyNodes.length - 1; i >= 0; i--) {
    if (healthyNodes[i] >= threshold) return i;
  }
  return Math.floor(healthyNodes.length / 2);
}
