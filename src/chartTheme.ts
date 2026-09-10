/** Shared Plotly styling so every chart reads as part of the same product. */

export const PALETTE = {
  accent: "#2563eb",
  violet: "#7c3aed",
  cyan: "#0891b2",
  good: "#16a34a",
  warn: "#f59e0b",
  bad: "#dc2626",
  muted: "#94a3b8",
};

const FONT = {
  family: '"Segoe UI", system-ui, -apple-system, sans-serif',
  size: 12,
  color: "#475569",
};

export const baseLayout = {
  font: FONT,
  paper_bgcolor: "transparent",
  plot_bgcolor: "transparent",
  xaxis: {
    gridcolor: "#eef2f7",
    linecolor: "#e2e8f0",
    zerolinecolor: "#e2e8f0",
    automargin: true,
  },
  yaxis: {
    gridcolor: "#eef2f7",
    linecolor: "#e2e8f0",
    zerolinecolor: "#e2e8f0",
    automargin: true,
  },
  hoverlabel: {
    bgcolor: "#0f172a",
    bordercolor: "#0f172a",
    font: { color: "white", size: 12, family: FONT.family },
  },
  margin: { l: 52, r: 18, t: 8, b: 38 },
} as const;

export const baseConfig = {
  displayModeBar: false,
  responsive: true,
} as const;

/** Merges the shared axis styling into a chart's own overrides. */
export function layout(overrides: Record<string, unknown> = {}) {
  const { xaxis, yaxis, ...rest } = overrides as {
    xaxis?: object;
    yaxis?: object;
    [k: string]: unknown;
  };
  return {
    ...baseLayout,
    ...rest,
    xaxis: { ...baseLayout.xaxis, ...(xaxis ?? {}) },
    yaxis: { ...baseLayout.yaxis, ...(yaxis ?? {}) },
  };
}
