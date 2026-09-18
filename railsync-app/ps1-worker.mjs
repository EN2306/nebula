import { parentPort, workerData } from 'node:worker_threads';
import { loadDataset, solve } from './ps1.mjs';
try {
  const d = loadDataset(workerData.files);
  Object.assign(d, workerData.constraints || {});
  const result = solve(d, workerData.scenario);
  result.disruptions = d.disruptions || [];
  parentPort.postMessage({ result });
} catch (error) {
  parentPort.postMessage({ error: error.message });
}
