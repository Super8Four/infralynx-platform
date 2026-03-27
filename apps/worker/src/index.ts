import { pathToFileURL } from "node:url";

import { startWorkerLoop } from "./jobs/index.js";

export { describeWorkerRuntime, runWorkerCycle, startWorkerLoop } from "./jobs/index.js";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void startWorkerLoop();
}
