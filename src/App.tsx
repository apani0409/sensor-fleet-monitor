import { useEffect, useMemo, useState } from "react";
import { loadDataset } from "./data";
import { buildSeriesIndex, defaultAsOfIdx } from "./fleetState";
import type { Dataset } from "./types";
import { FleetOverview } from "./views/FleetOverview";
import { NodeDetail } from "./views/NodeDetail";
import { DataQuality } from "./views/DataQuality";
import { Analytics } from "./views/Analytics";
import "./App.css";

type ViewKey = "flota" | "nodo" | "calidad" | "ml";

const NAV: { key: ViewKey; label: string; hint: string }[] = [
  { key: "flota", label: "Flota", hint: "Estado general y mapa" },
  { key: "nodo", label: "Nodo", hint: "Detalle por sensor" },
  { key: "calidad", label: "Calidad de datos", hint: "Qué se descarta y por qué" },
  { key: "ml", label: "Modelos", hint: "Predicción y anomalías" },
];

function App() {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewKey>("flota");
  const [selected, setSelected] = useState<number | null>(null);
  const [asOfIdx, setAsOfIdx] = useState(0);

  // Built once: scrubbing through time re-reads this instead of re-scanning
  // all 36k node-hours on every frame.
  const index = useMemo(
    () => (data ? buildSeriesIndex(data.series) : null),
    [data]
  );

  useEffect(() => {
    loadDataset()
      .then((d) => {
        setData(d);
        setSelected(d.nodes[0]?.node ?? null);
        setAsOfIdx(defaultAsOfIdx(d.meta.fleetHourly.healthyNodes));
      })
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="boot boot-error">Error cargando los datos: {error}</div>;
  if (!data || !index)
    return <div className="boot">Cargando 2.3 millones de lecturas...</div>;

  const selectNode = (node: number) => {
    setSelected(node);
    setView("nodo");
  };

  const period = data.meta.source.period;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" />
          <div>
            <strong>Sensor Fleet Monitor</strong>
            <span className="brand-sub">Monitoreo de flota IoT</span>
          </div>
        </div>

        <nav>
          {NAV.map((item) => (
            <button
              key={item.key}
              className={`nav-item ${view === item.key ? "active" : ""}`}
              onClick={() => setView(item.key)}
            >
              <span className="nav-label">{item.label}</span>
              <span className="nav-hint">{item.hint}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="source-card">
            <strong>Datos reales</strong>
            <p>{data.meta.source.name}</p>
            <p className="muted">
              {data.meta.source.nodes} nodos ·{" "}
              {(data.meta.source.rawReadings / 1e6).toFixed(1)}M lecturas
            </p>
            <a href={data.meta.source.url} target="_blank" rel="noreferrer">
              Fuente del dataset
            </a>
          </div>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <h1>{NAV.find((n) => n.key === view)?.label}</h1>
            <p className="period">
              {new Date(period.from).toLocaleDateString("es-CR", { timeZone: "UTC" })} —{" "}
              {new Date(period.to).toLocaleDateString("es-CR", { timeZone: "UTC" })}
            </p>
          </div>
          <a
            className="repo-link"
            href="https://github.com/apani0409/sensor-fleet-monitor"
            target="_blank"
            rel="noreferrer"
          >
            Código fuente
          </a>
        </header>

        <div className="view">
          {view === "flota" && (
            <FleetOverview
              data={data}
              index={index}
              asOfIdx={asOfIdx}
              onAsOfChange={setAsOfIdx}
              selected={selected}
              onSelect={selectNode}
            />
          )}
          {view === "nodo" && selected !== null && (
            <NodeDetail data={data} selected={selected} onSelect={setSelected} />
          )}
          {view === "calidad" && <DataQuality data={data} />}
          {view === "ml" && (
            <Analytics data={data} selected={selected} onSelect={setSelected} />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
