import Plot from "react-plotly.js";
import { KpiCard } from "../components/KpiCard";
import { NodeMap } from "../components/NodeMap";
import { formatNumber } from "../data";
import { baseConfig, layout, PALETTE } from "../chartTheme";
import type { Dataset } from "../types";

const FEATURE_LABEL: Record<string, string> = {
  voltage: "Voltaje actual",
  voltage_slope_6h: "Caída de voltaje (6 h)",
  voltage_slope_24h: "Caída de voltaje (24 h)",
  readings_rate: "Tasa de reporte",
};

interface Props {
  data: Dataset;
  selected: number | null;
  onSelect: (node: number) => void;
}

export function Analytics({ data, selected, onSelect }: Props) {
  const { drift, failurePrediction: fp } = data.meta.models;
  const lift = fp.trained ? fp.averagePrecision / fp.baseRate : 0;

  return (
    <>
      <section className="panel highlight">
        <h2>Predicción de fallo de nodo</h2>
        <p>
          La pregunta que un equipo de operaciones tiene de verdad no es "¿cuál falló?" sino
          "¿cuál estoy por perder?". Este modelo predice si un nodo dejará de reportar
          permanentemente <strong>dentro de las próximas 24 horas</strong>, usando solo
          información disponible en tiempo real: su voltaje actual y qué tan rápido está
          cayendo.
        </p>
      </section>

      <div className="kpi-row">
        <KpiCard
          label="ROC AUC"
          value={fp.rocAuc.toFixed(3)}
          sub="capacidad de ordenar riesgo"
          tone="good"
        />
        <KpiCard
          label="Precisión promedio"
          value={fp.averagePrecision.toFixed(3)}
          sub={`${lift.toFixed(1)}× sobre azar`}
          tone="good"
        />
        <KpiCard
          label="Tasa base"
          value={`${(fp.baseRate * 100).toFixed(1)}%`}
          sub="de node-horas que preceden un fallo"
        />
        <KpiCard
          label="Entrenamiento / prueba"
          value={`${formatNumber(fp.trainSize)} / ${formatNumber(fp.testSize)}`}
          sub="partición estratificada"
        />
      </div>

      <div className="panel-grid">
        <section className="panel">
          <h2>Qué pesa en la predicción</h2>
          <p className="panel-note">
            Coeficientes de la regresión logística sobre variables estandarizadas. Un peso
            negativo significa que valores altos de esa variable reducen el riesgo de fallo.
          </p>
          <Plot
            data={[
              {
                y: fp.coefficients.map((c) => FEATURE_LABEL[c.feature] ?? c.feature),
                x: fp.coefficients.map((c) => c.weight),
                type: "bar",
                orientation: "h",
                marker: {
                  color: fp.coefficients.map((c) => (c.weight >= 0 ? "#dc2626" : "#16a34a")),
                },
                hovertemplate: "%{y}: %{x:.3f}<extra></extra>",
              },
            ]}
            layout={layout({
              autosize: true,
              height: 280,
              margin: { l: 170, r: 20, t: 10, b: 40 },
              xaxis: { title: { text: "Peso" }, zeroline: true },
              showlegend: false,
            })}
            useResizeHandler
            style={{ width: "100%" }}
            config={baseConfig}
          />
          <p className="panel-note">
            El resultado es coherente con la física del problema: cuanto más bajo el voltaje y
            más rápido cae, más cerca está el nodo de apagarse.
          </p>
        </section>

        <section className="panel">
          <h2>Deriva por batería</h2>
          <p className="panel-note">
            Sin instrumento de referencia, la flota es su propia referencia: la mayoría de los
            nodos está sana la mayor parte del tiempo, así que la mediana entre nodos estima
            el valor real. Un nodo que se aleja de ella está derivando.
          </p>
          <Plot
            data={[
              {
                x: drift.curve.map((p) => `${p.voltageFrom}–${p.voltageTo}`),
                y: drift.curve.map((p) => p.medianAbsDeviation),
                type: "bar",
                name: "Mediana |desviación|",
                marker: {
                  color: drift.curve.map((p) =>
                    p.voltageTo <= drift.voltageCritical ? "#dc2626" : "#2563eb"
                  ),
                },
                hovertemplate:
                  "%{x} V<br>%{y:.2f} °C de desviación<br>%{customdata:,} muestras<extra></extra>",
                customdata: drift.curve.map((p) => p.samples),
              },
            ]}
            layout={layout({
              autosize: true,
              height: 280,
              margin: { l: 60, r: 20, t: 10, b: 50 },
              xaxis: { title: { text: "Rango de voltaje (V)" } },
              yaxis: { title: { text: "Mediana |desviación| (°C)" } },
              showlegend: false,
            })}
            useResizeHandler
            style={{ width: "100%" }}
            config={baseConfig}
          />
          <p className="panel-note">
            Correlación voltaje / |desviación|: <strong>{drift.correlation.toFixed(3)}</strong>.
            La mediana de desviación pasa de {drift.medianDeviationHealthy.toFixed(2)} °C con
            batería sana a {drift.medianDeviationFailing.toFixed(2)} °C bajo{" "}
            {drift.voltageCritical} V — un {(
              (drift.medianDeviationFailing / drift.medianDeviationHealthy - 1) *
              100
            ).toFixed(0)}
            % más. La correlación es moderada porque muchos nodos mueren antes de derivar mucho;
            el salto entre grupos es la señal más clara.
          </p>
        </section>
      </div>

      <div className="panel-grid">
        <section className="panel">
          <h2>Detección de anomalías</h2>
          <p className="panel-note">
            Isolation Forest sobre el estado conjunto (temperatura, humedad, luz, voltaje y
            desviación respecto a la flota). No supervisado a propósito: el dataset no trae
            etiquetas de anomalía, así que el modelo marca combinaciones inusuales que ningún
            umbral por variable individual atraparía.
          </p>
          <Plot
            data={[
              {
                x: data.meta.fleetHourly.hours,
                y: data.meta.fleetHourly.anomalies,
                type: "bar",
                marker: { color: PALETTE.bad },
                hovertemplate: "%{x}<br>%{y} anomalías<extra></extra>",
              },
            ]}
            layout={layout({
              autosize: true,
              height: 260,
              margin: { l: 50, r: 20, t: 10, b: 40 },
              yaxis: { title: { text: "Anomalías por hora" } },
              showlegend: false,
            })}
            useResizeHandler
            style={{ width: "100%" }}
            config={baseConfig}
          />
        </section>

        <section className="panel">
          <h2>Agrupamiento por comportamiento</h2>
          <p className="panel-note">
            K-means sobre el perfil de cada nodo (medias, variabilidad, batería mínima, tasa de
            anomalías). Agrupa por cómo se comporta el sensor, no por dónde está — y aun así
            los grupos tienden a coincidir con zonas del laboratorio.
          </p>
          <NodeMap nodes={data.nodes} selected={selected} onSelect={onSelect} colorBy="cluster" />
        </section>
      </div>

      <section className="panel">
        <h2>Cómo se entrenó</h2>
        <ul className="method-list">
          <li>
            <strong>Pipeline en Python</strong> (pandas + scikit-learn) que procesa los{" "}
            {formatNumber(data.meta.source.rawReadings)} registros crudos y exporta artefactos
            JSON compactos. El sitio no entrena nada en el navegador: sirve resultados ya
            calculados, que es como funciona un tablero real.
          </li>
          <li>
            <strong>Sin fuga de información</strong>: las variables del modelo de fallo son solo
            las disponibles en el momento de la predicción — voltaje actual y su pendiente. La
            etiqueta mira al futuro; las variables no.
          </li>
          <li>
            <strong>Partición estratificada</strong> 70/30 con la clase minoritaria preservada, y
            ponderación de clases por el desbalance ({(fp.baseRate * 100).toFixed(1)}% de casos
            positivos).
          </li>
          <li>
            <strong>Métrica honesta</strong>: con clases tan desbalanceadas el accuracy no dice
            nada, así que se reporta ROC AUC y precisión promedio contra la tasa base.
          </li>
        </ul>
      </section>
    </>
  );
}
