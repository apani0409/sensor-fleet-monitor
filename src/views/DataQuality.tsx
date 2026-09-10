import Plot from "react-plotly.js";
import { KpiCard } from "../components/KpiCard";
import { StatusBadge } from "../components/StatusBadge";
import { formatNumber } from "../data";
import type { Dataset } from "../types";

export function DataQuality({ data }: { data: Dataset }) {
  const { meta, nodes } = data;
  const q = meta.quality;

  const worst = [...nodes]
    .sort((a, b) => b.invalidReadings - a.invalidReadings)
    .slice(0, 12);

  const coverageSorted = [...nodes].sort((a, b) => a.coveragePct - b.coveragePct);

  return (
    <>
      <div className="kpi-row">
        <KpiCard
          label="Lecturas crudas"
          value={formatNumber(meta.source.rawReadings)}
          sub="antes de cualquier filtro"
        />
        <KpiCard
          label="Fuera de rango físico"
          value={`${q.invalidPct.toFixed(1)}%`}
          sub={`${formatNumber(q.invalidReadings)} lecturas descartadas`}
          tone="bad"
        />
        <KpiCard
          label="Por temperatura"
          value={formatNumber(q.invalidByCause.temperature)}
          sub={`fuera de ${q.tempRange[0]} a ${q.tempRange[1]} °C`}
          tone="warn"
        />
        <KpiCard
          label="Por humedad"
          value={formatNumber(q.invalidByCause.humidity)}
          sub={`fuera de ${q.humidityRange[0]} a ${q.humidityRange[1]}%`}
          tone="warn"
        />
        <KpiCard
          label="Por voltaje"
          value={formatNumber(q.invalidByCause.voltage)}
          sub={`fuera de ${q.voltageRange[0]} a ${q.voltageRange[1]} V`}
          tone="warn"
        />
      </div>

      <section className="panel highlight">
        <h2>Una de cada cinco lecturas es físicamente imposible</h2>
        <p>
          El {q.invalidPct.toFixed(1)}% de las lecturas de este despliegue real está fuera de
          lo que el hardware puede medir: temperaturas sobre {q.tempRange[1]} °C, humedades
          negativas, voltajes imposibles. No es ruido aleatorio — es la firma de nodos
          muriéndose. Las causas se solapan porque un nodo con la batería agotada falla en
          varias medidas a la vez.
        </p>
        <p>
          Estas lecturas se marcan y se cuentan, pero <strong>no se borran</strong>: son la
          evidencia del fallo. Lo que sí se hace es excluirlas de todo agregado que pretenda
          describir el ambiente, para que una batería agotada no se convierta en una ola de
          calor en el promedio.
        </p>
      </section>

      <div className="panel-grid">
        <section className="panel">
          <h2>Nodos con más lecturas inválidas</h2>
          <Plot
            data={[
              {
                x: worst.map((n) => `#${n.node}`),
                y: worst.map((n) => n.invalidReadings),
                type: "bar",
                marker: { color: "#dc2626" },
                hovertemplate: "Nodo %{x}<br>%{y:,} inválidas<extra></extra>",
              },
            ]}
            layout={{
              autosize: true,
              height: 300,
              margin: { l: 60, r: 20, t: 10, b: 40 },
              yaxis: { title: { text: "Lecturas inválidas" } },
              showlegend: false,
            }}
            useResizeHandler
            style={{ width: "100%" }}
            config={{ displayModeBar: false }}
          />
        </section>

        <section className="panel">
          <h2>Cobertura temporal por nodo</h2>
          <p className="panel-note">
            Porcentaje de horas con al menos una lectura válida, entre la primera y la última
            que reportó cada nodo.
          </p>
          <Plot
            data={[
              {
                x: coverageSorted.map((n) => `#${n.node}`),
                y: coverageSorted.map((n) => n.coveragePct),
                type: "bar",
                marker: {
                  color: coverageSorted.map((n) =>
                    n.coveragePct >= 90 ? "#16a34a" : n.coveragePct >= 70 ? "#f59e0b" : "#dc2626"
                  ),
                },
                hovertemplate: "Nodo %{x}<br>%{y:.0f}% de cobertura<extra></extra>",
              },
            ]}
            layout={{
              autosize: true,
              height: 300,
              margin: { l: 60, r: 20, t: 10, b: 40 },
              yaxis: { title: { text: "Cobertura %" }, range: [0, 100] },
              showlegend: false,
            }}
            useResizeHandler
            style={{ width: "100%" }}
            config={{ displayModeBar: false }}
          />
        </section>
      </div>

      <section className="panel">
        <h2>Inventario completo</h2>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nodo</th>
                <th>Estado</th>
                <th>Cobertura</th>
                <th>Válidas</th>
                <th>Inválidas</th>
                <th>Batería final</th>
                <th>Desv. media</th>
                <th>Anomalías</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((n) => (
                <tr key={n.node}>
                  <td>#{n.node}</td>
                  <td>
                    <StatusBadge status={n.status} />
                  </td>
                  <td>{n.coveragePct.toFixed(0)}%</td>
                  <td>{formatNumber(n.readings)}</td>
                  <td className={n.invalidReadings > 0 ? "cell-bad" : ""}>
                    {formatNumber(n.invalidReadings)}
                  </td>
                  <td>{n.voltageLast === null ? "—" : `${n.voltageLast.toFixed(2)} V`}</td>
                  <td>
                    {n.meanAbsDeviation === null
                      ? "—"
                      : `${n.meanAbsDeviation.toFixed(2)} °C`}
                  </td>
                  <td>{n.anomalies}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
