import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fleetKpis, nodeSeries, triageNodes } from "./data";
import type { Meta, SensorNode, Series } from "./types";

const read = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../public/data/${name}`, import.meta.url), "utf-8"));

const nodes = read<SensorNode[]>("nodes.json");
const series = read<Series>("series.json");
const meta = read<Meta>("meta.json");

describe("nodeSeries", () => {
  it("pivots the columnar store into one node's readings", () => {
    const fake: Series = {
      hours: ["2004-03-01T00:00:00", "2004-03-01T01:00:00"],
      node: [1, 2, 1],
      hourIdx: [0, 0, 1],
      temperature: [20, 30, 21],
      humidity: [40, 50, 41],
      light: [10, 11, 12],
      voltage: [2.7, 2.6, 2.69],
      tempDeviation: [0.1, 0.2, -0.1],
      anomaly: [0, 1, 0],
    };
    const out = nodeSeries(fake, 1);
    expect(out.hours).toEqual(["2004-03-01T00:00:00", "2004-03-01T01:00:00"]);
    expect(out.temperature).toEqual([20, 21]);
    expect(out.anomaly).toEqual([0, 0]);
  });

  it("returns aligned arrays of equal length for a real node", () => {
    const out = nodeSeries(series, nodes[0].node);
    expect(out.hours.length).toBeGreaterThan(0);
    for (const key of ["temperature", "humidity", "voltage", "anomaly"] as const) {
      expect(out[key].length, key).toBe(out.hours.length);
    }
  });
});

describe("fleetKpis", () => {
  it("partitions every node into exactly one status", () => {
    const k = fleetKpis(nodes, meta.models.drift.voltageCritical);
    expect(k.healthy + k.degraded + k.offline).toBe(k.total);
    expect(k.total).toBe(nodes.length);
  });

  it("computes a median coverage inside the observed range", () => {
    const k = fleetKpis(nodes, meta.models.drift.voltageCritical);
    const values = nodes.map((n) => n.coveragePct);
    expect(k.medianCoverage).toBeGreaterThanOrEqual(Math.min(...values));
    expect(k.medianCoverage).toBeLessThanOrEqual(Math.max(...values));
  });
});

describe("triageNodes", () => {
  it("puts offline nodes before degraded, and degraded before healthy", () => {
    const order = triageNodes(nodes).map((n) => n.status);
    const rank = { offline: 0, degraded: 1, healthy: 2 } as const;
    for (let i = 1; i < order.length; i++) {
      expect(rank[order[i]]).toBeGreaterThanOrEqual(rank[order[i - 1]]);
    }
  });
});

describe("shipped artifacts", () => {
  it("covers the full 54-node deployment", () => {
    expect(nodes.length).toBeGreaterThanOrEqual(50);
    expect(meta.source.rawReadings).toBeGreaterThan(2_000_000);
  });

  it("keeps every series column the same length", () => {
    const n = series.node.length;
    for (const key of [
      "hourIdx",
      "temperature",
      "humidity",
      "light",
      "voltage",
      "tempDeviation",
      "anomaly",
    ] as const) {
      expect(series[key].length, key).toBe(n);
    }
  });

  it("indexes every reading into a real hour", () => {
    const max = Math.max(...series.hourIdx);
    expect(max).toBeLessThan(series.hours.length);
  });

  it("reports a failure model that beats the base rate by a wide margin", () => {
    const fp = meta.models.failurePrediction;
    expect(fp.trained).toBe(true);
    expect(fp.rocAuc).toBeGreaterThan(0.8);
    expect(fp.averagePrecision).toBeGreaterThan(fp.baseRate * 3);
  });

  it("shows drift growing as batteries fail", () => {
    const d = meta.models.drift;
    expect(d.medianDeviationFailing).toBeGreaterThan(d.medianDeviationHealthy);
    // Lower voltage should mean larger deviation, hence a negative correlation.
    expect(d.correlation).toBeLessThan(0);
  });

  it("only keeps readings inside the declared physical bounds", () => {
    const [tMin, tMax] = meta.quality.tempRange;
    for (const t of series.temperature) {
      if (t === null) continue;
      expect(t).toBeGreaterThanOrEqual(tMin);
      expect(t).toBeLessThanOrEqual(tMax);
    }
  });
});
