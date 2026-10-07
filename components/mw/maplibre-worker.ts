import { setWorkerUrl } from "maplibre-gl";
// maplibre-gl 6 ships its web worker as a separate module; point it at the bundled copy (as halalfood.world does),
// otherwise every map logs "Worker failed to load" and never draws tiles.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

setWorkerUrl(workerUrl);
