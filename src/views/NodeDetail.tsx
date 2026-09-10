import { useMemo } from "react";
import Plot from "react-plotly.js";
import { KpiCard } from "../components/KpiCard";
import { StatusBadge } from "../components/StatusBadge";
import { formatDate, formatNumber, nodeSeries } from "../data";
import { baseConfig, layout, PALETTE } from "../chartTheme";
import type { Dataset } from "../types";

interface Props {
  data: Dataset;
  selected: number;
  onSelect: (node: number) => void;
}

export function NodeDetail({ data, selected, onSelect }: Props) {
  const node = data.nodes.find((n) => n.node === selected) ?? data.nodes[0];
  const series = useMemo(() => nodeSeries(data.series, node.node), [data.series, node.node]);
  const critical = data.meta.models.drift.voltageCritical;

  const anomalyPoints = series.hours
    .map((h, i) => ({ h, t: series.temperature[i], a: series.anomaly[i] }))
    .filter((p) => p.a === 1);

  return (
    <>
      <div className="node-header">
        <div>
          <h2>
            Nodo #{node.node} <StatusBadge status={node.status} />
          </h2>
          <p className="panel-note">
            Posición ({node.x ?? "—"}, {node.y ?? "—"}) · reportó de {formatDate(node.firstSeen)} a{" "}
            {formatDate(node.lastSeen)}
          </p>
        </div>
        <select
          value={node.node}
          onChange={(e) => onSelect(Number(e.target.value))}
          className="node-select"
        >
          {data.nodes.map((n) => (
            <option key={n.node} value={n.node}>
              Nodo #{n.node} — {n.status}
            </option>
          ))}
        </select>
      </div>

      <div className="kpi-row">
        <KpiCard
          label="Cobertura"
          value={`${node.coveragePct.toFixed(0)}%`}
          sub={`${formatNumber(node.hoursReported)} horas con dato`}
          tone={node.coveragePct >= 90 ? "good" : node.coveragePct >= 70 ? "warn" : "bad"}
        />
        <KpiCard
          label="Batería final"
          value={node.voltageLast === null ? "—" : `${node.voltageLast.toFixed(2)} V`}
          sub={`mínimo ${node.voltageMin?.toFixed(2) ?? "—"} V`}
          tone={
            node.voltageLast !== null && node.voltageLast < critical ? "bad" : "good"
          }
        />
        <KpiCard
          label="Lecturas inválidas"
          value={formatNumber(node.invalidReadings)}
          sub={`de ${formatNumber(node.readings + node.invalidReadings)} totales`}
          tone={node.invalidReadings > 0 ? "warn" : "good"}
        />
        <KpiCard
          label="Anomalías"
          value={String(node.anomalies)}
          sub={
            node.anomalyRate === null
              ? undefined
              : `${(node.anomalyRate * 100).toFixed(1)}% de sus horas`
          }
        />
        <KpiCard
          label="Desviación media"
          value={
            node.meanAbsDeviation === null ? "—" : `${node.meanAbsDeviation.toFixed(2)} °C`
          }
          sub="respecto a la mediana de la flota"
        />
        <KpiCard
          label="Horas sin reportar"
          value={String(node.hoursSilent)}
          tone={node.hoursSilent >= 24 ? "bad" : "good"}
        />
      </div>

      <section className="panel">
        <h2>Temperatura y anomalías</h2>
        <Plot
          data={[
            {
              x: series.hours,
              y: series.temperature,
              type: "scatter",
              mode: "lines",
              name: "Temperatura",
              line: { color: PALETTE.accent, width: 1.3 },
            },
            {
              x: anomalyPoints.map((p) => p.h),
              y: anomalyPoints.map((p) => p.t),
              type: "scatter",
              mode: "markers",
              name: "Anomalía",
              marker: { color: PALETTE.bad, size: 6, symbol: "x" },
            },
          ]}
          layout={layout({
            autosize: true,
            height: 300,
            margin: { l: 50, r: 20, t: 10, b: 40 },
            yaxis: { title: { text: "°C" } },
            legend: { orientation: "h", y: -0.2 },
            hovermode: "x unified",
          })}
          useResizeHandler
          style={{ width: "100%" }}
          config={baseConfig}
        />
      </section>

      <div className="panel-grid">
        <section className="panel">
          <h2>Batería</h2>
          <p className="panel-note">
            La línea roja marca los {critical} V bajo los cuales las lecturas dejan de ser
            confiables.
          </p>
          <Plot
            data={[
              {
                x: series.hours,
                y: series.voltage,
                type: "scatter",
                mode: "lines",
                name: "Voltaje",
                line: { color: PALETTE.violet, width: 1.5 },
              },
            ]}
            layout={layout({
              autosize: true,
              height: 260,
              margin: { l: 50, r: 20, t: 10, b: 40 },
              yaxis: { title: { text: "V" } },
              shapes: [
                {
                  type: "line",
                  xref: "paper",
                  x0: 0,
                  x1: 1,
                  yref: "y",
                  y0: critical,
                  y1: critical,
                  line: { color: PALETTE.bad, width: 1, dash: "dash" },
                },
              ],
              showlegend: false,
            })}
            useResizeHandler
            style={{ width: "100%" }}
            config={baseConfig}
          />
        </section>

        <section className="panel">
          <h2>Desviación respecto a la flota</h2>
          <p className="panel-note">
            Cuánto se aparta este nodo de la mediana de todos los demás en la misma hora. Con
            la batería sana ronda cero; al agotarse, se dispara.
          </p>
          <Plot
            data={[
              {
                x: series.hours,
                y: series.tempDeviation,
                type: "scatter",
                mode: "lines",
                name: "Desviación",
                line: { color: PALETTE.cyan, width: 1.3 },
              },
            ]}
            layout={layout({
              autosize: true,
              height: 260,
              margin: { l: 50, r: 20, t: 10, b: 40 },
              yaxis: { title: { text: "Δ °C" }, zeroline: true },
              showlegend: false,
            })}
            useResizeHandler
            style={{ width: "100%" }}
            config={baseConfig}
          />
        </section>
      </div>
    </>
  );
}
