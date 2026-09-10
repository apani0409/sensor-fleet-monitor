// Screenshots each view against the local preview server, so UI work can be
// looked at instead of guessed at.
import { chromium } from "playwright";

const BASE = process.env.SHOOT_BASE ?? "http://localhost:4173";
const OUT = process.env.SHOOT_OUT ?? "shots";

const views: { key: string; label: string }[] = [
  { key: "flota", label: "Flota" },
  { key: "nodo", label: "Nodo" },
  { key: "calidad", label: "Calidad de datos" },
  { key: "ml", label: "Modelos" },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector(".shell", { timeout: 30_000 });

for (const view of views) {
  await page.getByRole("button", { name: view.label, exact: false }).first().click();
  // let Plotly finish drawing
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${view.key}.png`, fullPage: true });
  console.log(`${OUT}/${view.key}.png`);
}

await browser.close();
