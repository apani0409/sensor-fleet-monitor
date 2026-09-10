// Flattens the JSON artifacts into two CSVs for the Power BI model.
// Power Query reads them straight from the repo's raw GitHub URLs, so the
// PBIP project refreshes on any machine with no local path configuration.

import type { SensorNode, Series } from "../src/types";

const nodes: SensorNode[] = await Bun.file("public/data/nodes.json").json();
const series: Series = await Bun.file("public/data/series.json").json();

const num = (v: number | null) => (v === null ? "" : String(v));

const nodeRows = [
  "NodeId,X,Y,Grupo,Estado,PrimeraLectura,UltimaLectura,HorasReportadas,LecturasValidas,LecturasInvalidas,CoberturaPct",
];
for (const n of nodes) {
  nodeRows.push(
    [
      n.node,
      num(n.x),
      num(n.y),
      n.cluster === null ? "" : n.cluster + 1,
      n.status,
      n.firstSeen.slice(0, 19).replace("T", " "),
      n.lastSeen.slice(0, 19).replace("T", " "),
      n.hoursReported,
      n.readings,
      n.invalidReadings,
      n.coveragePct,
    ].join(",")
  );
}

const readingRows = [
  "NodeId,Timestamp,Temperatura,Humedad,Luz,Voltaje,DesviacionTemp,Anomalia,LecturasInvalidas",
];
for (let i = 0; i < series.node.length; i++) {
  readingRows.push(
    [
      series.node[i],
      series.hours[series.hourIdx[i]].slice(0, 19).replace("T", " "),
      num(series.temperature[i]),
      num(series.humidity[i]),
      num(series.light[i]),
      num(series.voltage[i]),
      num(series.tempDeviation[i]),
      series.anomaly[i],
      series.invalid[i],
    ].join(",")
  );
}

await Bun.write("powerbi/data/nodos.csv", nodeRows.join("\n") + "\n");
await Bun.write("powerbi/data/lecturas.csv", readingRows.join("\n") + "\n");

console.log(
  `Wrote ${nodeRows.length - 1} nodes and ${readingRows.length - 1} node-hours to powerbi/data/`
);
