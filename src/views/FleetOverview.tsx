import Plot from "react-plotly.js";
import { KpiCard } from "../components/KpiCard";
import { NodeMap } from "../components/NodeMap";
import { StatusBadge } from "../components/StatusBadge";
import { fleetKpis, formatNumber, triageNodes } from "../data";
import type { Dataset } from "../types";

interface Props {
  data: Dataset;
  selected: number | null;
  onSelect: (node: number) => void;
}

export function FleetOverview({ data, selected, onSelect }: Props) {
  const { nodes, meta } = data;
  const kpis = fleetKpis(nodes, meta.models.drift.voltageCritical);
  const triage = triageNodes(nodes).slice(0, 10);
  const fleet = meta.fleetHourly;

  return (
    <>
      <div className="kpi-row">
        <KpiCard
          label="Nodos en la flota"
          value={String(kpis.total)}
          sub={`${formatNumber(meta.source.rawReadings)} lecturas crudas`}
        />
        <KpiCard
          label="Sanos"
          value={String(kpis.healthy)}
          sub={`${((kpis.healthy / kpis.total) * 100).toFixed(0)}% de la flota`}
          tone="good"
        />
        <KpiCard label="Degradados" value={String(kpis.degraded)} tone="warn" />
        <KpiCard
          label="Sin señal"
          value={String(kpis.offline)}
          sub="24 h o más sin reportar"
          tone="bad"
        />
        <KpiCard
          label="Batería crítica"
          value={String(kpis.nodesBelowCriticalVoltage)}
          sub={`bajo ${meta.models.drift.voltageCritical} V`}
          tone="warn"
        />
        <KpiCard
          label="Anomalías detectadas"
          value={formatNumber(kpis.totalAnomalies)}
          sub="Isolation Forest"
        />
      </div>

      <div className="panel-grid">
        <section className="panel">
          <h2>Mapa del despliegue</h2>
          <p className="panel-note">
            Posiciones reales de los 54 nodos en el laboratorio. Nodos vecinos deberían
            coincidir en sus lecturas, así que el que discrepa de los que tiene alrededor es
            el caso interesante.
          </p>
          <NodeMap nodes={nodes} selected={selected} onSelect={onSelect} />
        </section>

        <section className="panel">
          <h2>Nodos que requieren atención</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Nodo</th>
                <th>Estado</th>
                <th>Cobertura</th>
                <th>Batería</th>
                <th>Anomalías</th>
              </tr>
            </thead>
            <tbody>
              {triage.map((n) => (
                <tr
                  key={n.node}
                  onClick={() => onSelect(n.node)}
                  className={n.node === selected ? "row-selected" : ""}
                >
                  <td>#{n.node}</td>
                  <td>
                    <StatusBadge status={n.status} />
                  </td>
                  <td>{n.coveragePct.toFixed(0)}%</td>
                  <td>{n.voltageLast === null ? "—" : `${n.voltageLast.toFixed(2)} V`}</td>
                  <td>{n.anomalies}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="panel">
        <h2>Actividad de la flota</h2>
        <p className="panel-note">
          Nodos reportando por hora, y temperatura mediana de la flota. La caída sostenida de
          nodos activos es el despliegue quedándose sin baterías.
        </p>
        <Plot
          data={[
            {
              x: fleet.hours,
              y: fleet.activeNodes,
              type: "scatter",
              mode: "lines",
              name: "Nodos activos",
              line: { color: "#2563eb", width: 1.5 },
              fill: "tozeroy",
              fillcolor: "rgba(37,99,235,0.12)",
            },
            {
              x: fleet.hours,
              y: fleet.temperature,
              type: "scatter",
              mode: "lines",
              name: "Temp. mediana (°C)",
              yaxis: "y2",
              line: { color: "#f59e0b", width: 1.5 },
            },
          ]}
          layout={{
            autosize: true,
            height: 340,
            margin: { l: 50, r: 50, t: 10, b: 40 },
            yaxis: { title: { text: "Nodos activos" } },
            yaxis2: {
              title: { text: "°C" },
              overlaying: "y",
              side: "right",
              showgrid: false,
            },
            legend: { orientation: "h", y: -0.18 },
            hovermode: "x unified",
          }}
          useResizeHandler
          style={{ width: "100%" }}
          config={{ displayModeBar: false }}
        />
      </section>
    </>
  );
}
