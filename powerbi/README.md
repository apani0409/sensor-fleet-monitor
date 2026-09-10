# Power BI model — Sensor Fleet Monitor

A Power BI semantic model over the same sensor fleet data the web dashboard uses:
54 nodes, 36,136 node-hours, 21 DAX measures.

## Why PBIP and not a .pbix

`.pbix` is a binary container with a serialised VertiPaq database inside — it can only
be produced by Power BI Desktop itself. This project uses **PBIP** (Power BI Project),
Microsoft's source-control format, where the model and report are plain text. Everything
here was authored as files: no dragging fields in the UI.

That is also the point for review — `SensorFleetMonitor.SemanticModel/model.bim` is
readable on GitHub, so the DAX can be inspected without opening anything.

## Opening it

1. Open `SensorFleetMonitor.pbip` in Power BI Desktop (2023 or newer).
2. On first refresh Power BI asks for the privacy level of the data source: choose
   **Anonymous / Public**. Power Query reads the CSVs from this repo's raw GitHub URLs,
   so nothing needs to be configured locally.

## What is modelled

Star schema: `Lecturas` (fact, one row per node-hour) → `Nodos` (dimension).

Calculated columns carry the domain rules: `BateriaCritica` marks the 2.4 V threshold
below which the mote's ADC reference collapses, and `RangoVoltaje` buckets battery level
for the drift analysis.

### Measures worth looking at

| Measure | What it answers |
|---|---|
| `Nodos transmitiendo` vs `Nodos midiendo bien` | The gap between them *is* fleet degradation — nodes still broadcasting but no longer measuring anything usable |
| `Deriva con batería sana` / `Deriva con batería agotada` / `Factor de deriva` | How much worse a node measures once its battery fails, against the fleet's own consensus |
| `Temperatura mediana flota` | Median across nodes rather than a mean, so nodes that are drifting cannot drag the estimate |
| `Estado del nodo` | Status evaluated in whatever date context is applied, not a fixed value per node |
| `Horas sin reportar` | Silence measured against the fleet's most recent reading |

## Regenerating

```bash
bun run scripts/export-powerbi-csv.ts     # data/*.csv from the JSON artifacts
bun run scripts/build-powerbi-report.ts   # report.json
```

`report.json` is generated rather than hand-written: Power BI nests JSON inside JSON as
escaped strings, and a build script keeps the escaping correct and the layout reviewable
as code.
