export type NodeStatus = "healthy" | "degraded" | "offline";

export interface SensorNode {
  node: number;
  x: number | null;
  y: number | null;
  status: NodeStatus;
  cluster: number | null;
  firstSeen: string;
  lastSeen: string;
  hoursSilent: number;
  hoursReported: number;
  readings: number;
  invalidReadings: number;
  coveragePct: number;
  tempMean: number | null;
  humidityMean: number | null;
  voltageLast: number | null;
  voltageMin: number | null;
  anomalies: number;
  anomalyRate: number | null;
  meanAbsDeviation: number | null;
}

/** Columnar layout — one entry per node-hour, indexed into `hours`. */
export interface Series {
  hours: string[];
  node: number[];
  hourIdx: number[];
  temperature: (number | null)[];
  humidity: (number | null)[];
  light: (number | null)[];
  voltage: (number | null)[];
  tempDeviation: (number | null)[];
  anomaly: number[];
  invalid: number[];
}

export interface DriftCurvePoint {
  voltageFrom: number;
  voltageTo: number;
  medianAbsDeviation: number;
  meanAbsDeviation: number;
  samples: number;
}

export interface DriftModel {
  correlation: number;
  medianDeviationHealthy: number;
  medianDeviationFailing: number;
  voltageCritical: number;
  curve: DriftCurvePoint[];
}

export interface FailureModel {
  trained: boolean;
  rocAuc: number;
  averagePrecision: number;
  baseRate: number;
  trainSize: number;
  testSize: number;
  coefficients: { feature: string; weight: number }[];
}

export interface Meta {
  source: {
    name: string;
    url: string;
    nodes: number;
    rawReadings: number;
    period: { from: string; to: string };
  };
  quality: {
    invalidReadings: number;
    invalidPct: number;
    invalidByCause: { temperature: number; humidity: number; voltage: number };
    tempRange: [number, number];
    humidityRange: [number, number];
    voltageRange: [number, number];
  };
  models: { drift: DriftModel; failurePrediction: FailureModel };
  fleetHourly: {
    hours: string[];
    temperature: (number | null)[];
    humidity: (number | null)[];
    activeNodes: number[];
    healthyNodes: number[];
    anomalies: number[];
  };
}

export interface Dataset {
  nodes: SensorNode[];
  series: Series;
  meta: Meta;
}

/** One node's series, pivoted out of the columnar store. */
export interface NodeSeries {
  hours: string[];
  temperature: (number | null)[];
  humidity: (number | null)[];
  light: (number | null)[];
  voltage: (number | null)[];
  tempDeviation: (number | null)[];
  anomaly: number[];
}
