import { useMemo } from "react";
import Plot from "react-plotly.js";
import { KpiCard } from "../components/KpiCard";
import { NodeMap } from "../components/NodeMap";
import { StatusBadge } from "../components/StatusBadge";
import { formatNumber } from "../data";
import { baseConfig, layout, PALETTE } from "../chartTheme";
import { fleetStateAt, type SeriesIndex } from "../fleetState";
import type { Dataset } from "../types";

interface Props {
  data: Dataset;
  index: SeriesIndex;
  asOfIdx: number;
  onAsOfChange: (idx: number) => void;
  selected: number | null;
  onSelect: (node: number) => void;
}

/** Below this many reporting nodes the fleet median stops being trustworthy. */
const MIN_NODES_FOR_CONSENSUS = 10;

export function FleetOverview({
  data,
  index,
  asOfIdx,
  onAsOfChange,
  selected,
  onSelect,
}: Props) {
  const { meta, series, nodes } = data;
  const critical = meta.models.drift.voltageCritical;

  const state = useMemo(
    () => fleetStateAt(series, index, nodes, asOfIdx, critical),
    [series, index, nodes, asOfIdx, critical]
  );

  const counts = {
    healthy: state.filter((s) => s.status === "healthy").length,
    degraded: state.filter((s) => s.status === "degraded").length,
    offline: state.filter((s) => s.status === "offline").length,
  };
  const lowBattery = state.filter(
    (s) => s.voltage !== null && s.voltage < critical && s.status !== "offline"
  ).length;
  const anomalies = state.reduce((a, s) => a + s.anomaliesLast24h, 0);

  const statusByNode = new Map(state.map((s) => [s.node, s.status]));
  const mapNodes = nodes.map((n) => ({ ...n, status: statusByNode.get(n.node) ?? n.status }));

  const attention = [...state]
    .filter((s) => s.status !== "healthy")
    .sort((a, b) => {
      const rank = { offline: 0, degraded: 1, healthy: 2 } as const;
      const byStatus = rank[a.status] - rank[b.status];
      return byStatus !== 0 ? byStatus : b.anomaliesLast24h - a.anomaliesLast24h;
    })
    .slice(0, 10);

  const fleet = meta.fleetHourly;
  const asOfLabel = new Date(fleet.hours[asOfIdx]).toLocaleString("es-CR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

  // Once too few nodes remain, the median is computed over a handful of mostly
  // dying sensors. Showing it as if it were the room temperature would be a lie.
  const consensusEnds = fleet.healthyNodes.findIndex(
    (n, i) => i > 10 && n < MIN_NODES_FOR_CONSENSUS
  );
  const trustedTemp =
    consensusEnds === -1
      ? fleet.temperature
      : fleet.temperature.map((t, i) => (i < consensusEnds ? t : null));

  return (
    <>
      <section className="timebar">
        <div className="timebar-head">
          <div>
            <span className="timebar-label">Estado de la flota al</span>
            <strong className="timebar-value">{asOfLabel}</strong>
          </div>
          <span className="timebar-hint">
            El dataset es un registro histórico: arrastrá para ver cómo se apaga el
            despliegue conforme se agotan las baterías.
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={fleet.hours.length - 1}
          value={asOfIdx}
          onChange={(e) => onAsOfChange(Number(e.target.value))}
          className="timebar-range"
          aria-label="Momento de observación"
        />
        <div className="timebar-ends">
          <span>{new Date(fleet.hours[0]).toLocaleDateString("es-CR", { timeZone: "UTC" })}</span>
          <span>
            {new Date(fleet.hours[fleet.hours.length - 1]).toLocaleDateString("es-CR", {
              timeZone: "UTC",
            })}
          </span>
        </div>
      </section>

      <div className="kpi-row">
        <KpiCard
          label="Sanos"
          value={String(counts.healthy)}
          sub={`${((counts.healthy / nodes.length) * 100).toFixed(0)}% de ${nodes.length}`}
          tone="good"
        />
        <KpiCard
          label="Degradados"
          value={String(counts.degraded)}
          sub="batería baja, huecos o anomalías"
          tone="warn"
        />
        <KpiCard
          label="Sin señal"
          value={String(counts.offline)}
          sub="24 h o más sin reportar"
          tone="bad"
        />
        <KpiCard
          label="Batería crítica"
          value={String(lowBattery)}
          sub={`bajo ${critical} V y aún vivos`}
          tone={lowBattery > 0 ? "warn" : "good"}
        />
        <KpiCard
          label="Anomalías (24 h)"
          value={String(anomalies)}
          sub="Isolation Forest"
        />
        <KpiCard
          label="Lecturas crudas"
          value={`${(meta.source.rawReadings / 1e6).toFixed(1)}M`}
          sub={`${meta.quality.invalidPct}% descartadas`}
        />
      </div>

      <div className="panel-grid">
        <section className="panel">
          <h2>Mapa del despliegue</h2>
          <p className="panel-note">
            Posiciones reales de los nodos en el laboratorio. Nodos vecinos deberían coincidir
            en sus lecturas, así que el que discrepa de los que tiene alrededor es el caso
            interesante.
          </p>
          <NodeMap nodes={mapNodes} selected={selected} onSelect={onSelect} />
        </section>

        <section className="panel">
          <h2>Requieren atención</h2>
          <p className="panel-note">
            {attention.length === 0
              ? "Toda la flota reportando con normalidad en este momento."
              : `${attention.length} nodo(s) con problemas al ${asOfLabel}.`}
          </p>
          <div className="table-scroll-sm">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nodo</th>
                  <th>Estado</th>
                  <th>Sin reportar</th>
                  <th>Batería</th>
                  <th>Anom. 24h</th>
                </tr>
              </thead>
              <tbody>
                {attention.map((s) => (
                  <tr
                    key={s.node}
                    onClick={() => onSelect(s.node)}
                    className={s.node === selected ? "row-selected" : ""}
                  >
                    <td>#{s.node}</td>
                    <td>
                      <StatusBadge status={s.status} />
                    </td>
                    <td>{s.hoursSilent} h</td>
                    <td>{s.voltage === null ? "—" : `${s.voltage.toFixed(2)} V`}</td>
                    <td>{s.anomaliesLast24h}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="panel">
        <h2>Actividad de la flota</h2>
        <p className="panel-note">
          La distancia entre las dos líneas azules es la degradación del despliegue: nodos que
          siguen transmitiendo pero ya no miden nada utilizable, porque la batería cayó bajo{" "}
          {critical} V o sus lecturas salen fuera de rango físico. La temperatura mediana se
          corta cuando quedan menos de {MIN_NODES_FOR_CONSENSUS} nodos sanos: con tan pocos
          sensores la mediana deja de estimar la temperatura del laboratorio.
        </p>
        <Plot
          data={[
            {
              x: fleet.hours,
              y: fleet.activeNodes,
              type: "scatter",
              mode: "lines",
              name: "Transmitiendo",
              line: { color: PALETTE.muted, width: 1.4 },
              fill: "tozeroy",
              fillcolor: "rgba(148,163,184,0.15)",
            },
            {
              x: fleet.hours,
              y: fleet.healthyNodes,
              type: "scatter",
              mode: "lines",
              name: "Midiendo bien",
              line: { color: PALETTE.accent, width: 1.8 },
              fill: "tozeroy",
              fillcolor: "rgba(37,99,235,0.14)",
            },
            {
              x: fleet.hours,
              y: trustedTemp,
              type: "scatter",
              mode: "lines",
              name: "Temp. mediana (°C)",
              yaxis: "y2",
              line: { color: PALETTE.warn, width: 1.6 },
              connectgaps: false,
            },
          ]}
          layout={layout({
            height: 320,
            margin: { l: 52, r: 58, t: 8, b: 38 },
            yaxis: { title: { text: "Nodos" }, rangemode: "tozero" },
            yaxis2: {
              title: { text: "°C" },
              overlaying: "y",
              side: "right",
              showgrid: false,
              range: [15, 40],
            },
            legend: { orientation: "h", y: -0.16 },
            hovermode: "x unified",
            shapes: [
              {
                type: "line",
                yref: "paper",
                y0: 0,
                y1: 1,
                xref: "x",
                x0: fleet.hours[asOfIdx],
                x1: fleet.hours[asOfIdx],
                line: { color: PALETTE.bad, width: 1.5, dash: "dot" },
              },
            ],
          })}
          useResizeHandler
          style={{ width: "100%" }}
          config={baseConfig}
        />
      </section>

      <section className="panel">
        <h2>Contexto del despliegue</h2>
        <div className="fact-row">
          <div>
            <strong>{formatNumber(meta.source.rawReadings)}</strong>
            <span>lecturas crudas procesadas</span>
          </div>
          <div>
            <strong>{meta.source.nodes}</strong>
            <span>nodos desplegados</span>
          </div>
          <div>
            <strong>{meta.quality.invalidPct}%</strong>
            <span>físicamente imposibles</span>
          </div>
          <div>
            <strong>{meta.models.failurePrediction.rocAuc.toFixed(3)}</strong>
            <span>ROC AUC prediciendo fallos</span>
          </div>
        </div>
      </section>
    </>
  );
}
