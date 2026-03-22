import { PicoCAD2Context, PicoCAD2Viewer } from "../lib/main.ts";
import "./style.css";

const context = new PicoCAD2Context();
const models = new Map<string, string>();
const MODEL_NAMES = [
	"advanced_meshes",
	"livingroom",
	"pig",
	"pirate",
	"rig",
	"waterfall",
] as const;

async function fetchModel(name: string): Promise<string> {
	const cached = models.get(name);
	if (cached) return cached;
	const res = await fetch(`/src/example-models/${name}.txt`);
	const text = await res.text();
	models.set(name, text);
	return text;
}

async function fetchAllModels(): Promise<string[]> {
	return Promise.all(MODEL_NAMES.map(fetchModel));
}

const perfGrid = document.getElementById("perf-grid");
const perfStats = document.getElementById("perf-stats");
const perfApply = document.getElementById("perf-apply");
const perfCount = document.getElementById(
	"perf-count",
) as HTMLInputElement | null;

if (!perfGrid || !perfStats || !perfCount || !perfApply) {
	throw new Error("Missing performance testing elements in the DOM");
}

let perfViewers: PicoCAD2Viewer[] = [];
let perfAnimId = 0;

function createPerfViewers(count: number, modelTexts: string[]): void {
	if (!perfGrid || !perfStats) return;

	cancelAnimationFrame(perfAnimId);
	for (const v of perfViewers) {
		v.dispose();
	}
	perfViewers = [];
	perfGrid.innerHTML = "";

	for (let i = 0; i < count; i++) {
		const canvas = document.createElement("canvas");
		perfGrid.appendChild(canvas);

		const v = new PicoCAD2Viewer({
			canvas,
			context,
			resolution: { width: 128, height: 128, scale: 2 },
		});

		v.load(modelTexts[i % modelTexts.length]);
		v.startRenderLoop();
		v.enableCameraControls();
		perfViewers.push(v);
	}

	startPerfCounter();
}

function startPerfCounter(): void {
	if (!perfStats) return;

	let lastTime = performance.now();
	let frameCount = 0;
	let totalDrawCalls = 0;
	let totalPolys = 0;

	const loop = (now: number): void => {
		perfAnimId = requestAnimationFrame(loop);

		const { drawCalls, polyCount } = context.stats;
		totalDrawCalls += drawCalls * perfViewers.length;
		totalPolys += polyCount * perfViewers.length;
		frameCount++;

		if (now - lastTime >= 1000) {
			const fps = Math.round((frameCount * 1000) / (now - lastTime));
			perfStats.textContent = `FPS: ${fps} | Viewers: ${perfViewers.length} | Draw calls/f: ${Math.round(totalDrawCalls / frameCount)} | Polys/f: ${Math.round(totalPolys / frameCount)}`;
			frameCount = 0;
			totalDrawCalls = 0;
			totalPolys = 0;
			lastTime = now;
		}
	};

	perfAnimId = requestAnimationFrame(loop);
}

perfApply.addEventListener("click", async () => {
	const count = Math.max(1, Math.min(500, parseInt(perfCount.value, 10) || 1));
	perfCount.value = String(count);

	const modelTexts = await fetchAllModels();
	createPerfViewers(count, modelTexts);
});

async function init(): Promise<void> {
	const allModels = await fetchAllModels();

	createPerfViewers(6, allModels);
}

init();
