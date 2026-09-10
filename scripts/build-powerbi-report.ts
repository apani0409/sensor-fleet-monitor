// Generates powerbi/SensorFleetMonitor.Report/report.json.
//
// Power BI's report format nests JSON inside JSON as escaped strings, which is
// unpleasant to write by hand and easy to get subtly wrong. Building it here
// keeps the escaping correct and the layout reviewable as code.

type Role = "Values" | "Category" | "Y" | "Series";

interface Field {
  entity: string;
  property: string;
  kind: "measure" | "column";
  role: Role;
  /** 0=Sum 1=Avg 2=Min 3=Max 4=Count — omit for measures. */
  aggregate?: number;
}

interface VisualSpec {
  id: string;
  visualType: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fields: Field[];
  title?: string;
}

const alias = (entity: string) => entity.charAt(0).toLowerCase();
const AGG_NAME = ["Sum", "Avg", "Min", "Max", "Count"];

function buildSelect(field: Field) {
  const sourceRef = { Expression: { SourceRef: { Source: alias(field.entity) } } };
  const name = `${field.entity}.${field.property}`;

  if (field.kind === "measure") {
    return { Measure: { ...sourceRef, Property: field.property }, Name: name };
  }
  if (field.aggregate !== undefined) {
    return {
      Aggregation: {
        Expression: { Column: { ...sourceRef, Property: field.property } },
        Function: field.aggregate,
      },
      Name: `${AGG_NAME[field.aggregate] ?? "Sum"}(${name})`,
    };
  }
  return { Column: { ...sourceRef, Property: field.property }, Name: name };
}

function buildVisualContainer(visual: VisualSpec) {
  const entities = [...new Set(visual.fields.map((f) => f.entity))];

  const prototypeQuery = {
    Version: 2,
    From: entities.map((entity) => ({ Name: alias(entity), Entity: entity, Type: 0 })),
    Select: visual.fields.map(buildSelect),
  };

  const projections: Partial<Record<Role, { queryRef: string }[]>> = {};
  for (const [i, field] of visual.fields.entries()) {
    (projections[field.role] ??= []).push({ queryRef: prototypeQuery.Select[i].Name });
  }

  const config = {
    name: visual.id,
    layouts: [
      {
        id: 0,
        position: { x: visual.x, y: visual.y, z: 0, width: visual.width, height: visual.height },
      },
    ],
    singleVisual: {
      visualType: visual.visualType,
      projections,
      prototypeQuery,
      drillFilterOtherVisuals: true,
      objects: visual.title
        ? {
            title: [
              {
                properties: {
                  text: { expr: { Literal: { Value: `'${visual.title}'` } } },
                  show: { expr: { Literal: { Value: "true" } } },
                },
              },
            ],
          }
        : {},
    },
  };

  return {
    x: visual.x,
    y: visual.y,
    width: visual.width,
    height: visual.height,
    z: 0,
    config: JSON.stringify(config),
    filters: "[]",
  };
}

const overview: VisualSpec[] = [
  {
    id: "kpiNodos",
    visualType: "card",
    title: "Nodos en la flota",
    x: 20,
    y: 20,
    width: 200,
    height: 110,
    fields: [{ entity: "Nodos", property: "Nodos en la flota", kind: "measure", role: "Values" }],
  },
  {
    id: "kpiNodeHoras",
    visualType: "card",
    title: "Node-horas analizadas",
    x: 232,
    y: 20,
    width: 200,
    height: 110,
    fields: [{ entity: "Lecturas", property: "Node-horas", kind: "measure", role: "Values" }],
  },
  {
    id: "kpiInvalidas",
    visualType: "card",
    title: "Lecturas inválidas",
    x: 444,
    y: 20,
    width: 200,
    height: 110,
    fields: [
      { entity: "Lecturas", property: "Lecturas inválidas", kind: "measure", role: "Values" },
    ],
  },
  {
    id: "kpiDeriva",
    visualType: "card",
    title: "Factor de deriva por batería",
    x: 656,
    y: 20,
    width: 200,
    height: 110,
    fields: [{ entity: "Lecturas", property: "Factor de deriva", kind: "measure", role: "Values" }],
  },
  {
    id: "kpiAnomalias",
    visualType: "card",
    title: "% node-horas anómalas",
    x: 868,
    y: 20,
    width: 200,
    height: 110,
    fields: [
      { entity: "Lecturas", property: "% node-horas anómalas", kind: "measure", role: "Values" },
    ],
  },
  {
    id: "flotaEnTiempo",
    visualType: "lineChart",
    title: "Transmitiendo vs. midiendo bien",
    x: 20,
    y: 150,
    width: 660,
    height: 300,
    fields: [
      { entity: "Lecturas", property: "Fecha", kind: "column", role: "Category" },
      { entity: "Lecturas", property: "Nodos transmitiendo", kind: "measure", role: "Y" },
      { entity: "Lecturas", property: "Nodos midiendo bien", kind: "measure", role: "Y" },
    ],
  },
  {
    id: "derivaPorVoltaje",
    visualType: "columnChart",
    title: "Deriva media por rango de batería",
    x: 692,
    y: 150,
    width: 376,
    height: 300,
    fields: [
      { entity: "Lecturas", property: "RangoVoltaje", kind: "column", role: "Category" },
      { entity: "Lecturas", property: "Desviación media absoluta", kind: "measure", role: "Y" },
    ],
  },
  {
    id: "tablaNodos",
    visualType: "tableEx",
    title: "Inventario de nodos",
    x: 20,
    y: 466,
    width: 800,
    height: 240,
    fields: [
      { entity: "Nodos", property: "NodeId", kind: "column", role: "Values" },
      { entity: "Nodos", property: "Estado", kind: "column", role: "Values" },
      { entity: "Nodos", property: "CoberturaPct", kind: "column", role: "Values", aggregate: 1 },
      { entity: "Lecturas", property: "Voltaje mínimo", kind: "measure", role: "Values" },
      { entity: "Lecturas", property: "Desviación media absoluta", kind: "measure", role: "Values" },
      { entity: "Lecturas", property: "Anomalías", kind: "measure", role: "Values" },
    ],
  },
  {
    id: "selectorNodo",
    visualType: "slicer",
    title: "Nodo",
    x: 832,
    y: 466,
    width: 236,
    height: 240,
    fields: [{ entity: "Nodos", property: "NodeId", kind: "column", role: "Values" }],
  },
];

const calidad: VisualSpec[] = [
  {
    id: "invalidasPorNodo",
    visualType: "columnChart",
    title: "Lecturas inválidas por nodo",
    x: 20,
    y: 20,
    width: 660,
    height: 320,
    fields: [
      { entity: "Nodos", property: "NodeId", kind: "column", role: "Category" },
      { entity: "Lecturas", property: "Lecturas inválidas", kind: "measure", role: "Y" },
    ],
  },
  {
    id: "coberturaPorNodo",
    visualType: "columnChart",
    title: "Cobertura por nodo",
    x: 692,
    y: 20,
    width: 376,
    height: 320,
    fields: [
      { entity: "Nodos", property: "NodeId", kind: "column", role: "Category" },
      { entity: "Nodos", property: "CoberturaPct", kind: "column", role: "Y", aggregate: 1 },
    ],
  },
  {
    id: "voltajeVsDesviacion",
    visualType: "scatterChart",
    title: "Batería vs. deriva por nodo",
    x: 20,
    y: 356,
    width: 660,
    height: 320,
    fields: [
      { entity: "Nodos", property: "NodeId", kind: "column", role: "Category" },
      { entity: "Lecturas", property: "Voltaje mínimo", kind: "measure", role: "Values" },
      { entity: "Lecturas", property: "Desviación media absoluta", kind: "measure", role: "Values" },
    ],
  },
  {
    id: "anomaliasPorGrupo",
    visualType: "columnChart",
    title: "Anomalías por grupo de comportamiento",
    x: 692,
    y: 356,
    width: 376,
    height: 320,
    fields: [
      { entity: "Nodos", property: "Grupo", kind: "column", role: "Category" },
      { entity: "Lecturas", property: "Anomalías", kind: "measure", role: "Y" },
    ],
  },
];

function page(name: string, displayName: string, visuals: VisualSpec[], ordinal: number) {
  return {
    name,
    displayName,
    filters: "[]",
    ordinal,
    visualContainers: visuals.map(buildVisualContainer),
    config: JSON.stringify({}),
    displayOption: 1,
    width: 1280,
    height: 720,
  };
}

const report = {
  $schema:
    "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/1.0.0/schema.json",
  themeCollection: { baseTheme: { name: "CY24SU10", version: "5.55", type: 2 } },
  layoutOptimization: 0,
  resourcePackages: [
    {
      resourcePackage: {
        disabled: false,
        items: [{ name: "CY24SU10", path: "BaseThemes/CY24SU10.json", type: 202 }],
        name: "SharedResources",
        type: 2,
      },
    },
  ],
  sections: [
    page("EstadoFlota", "Estado de la flota", overview, 0),
    page("CalidadDatos", "Calidad de datos", calidad, 1),
  ],
  config: JSON.stringify({
    version: "5.55",
    themeCollection: { baseTheme: { name: "CY24SU10", version: "5.55", type: 2 } },
    activeSectionIndex: 0,
    defaultDrillFilterOtherVisuals: true,
    settings: { useStylableVisualContainerHeader: true },
  }),
  filters: "[]",
};

await Bun.write(
  "powerbi/SensorFleetMonitor.Report/report.json",
  JSON.stringify(report, null, 2)
);

const total = report.sections.reduce((a, s) => a + s.visualContainers.length, 0);
console.log(`Wrote report.json: ${report.sections.length} pages, ${total} visuals.`);
