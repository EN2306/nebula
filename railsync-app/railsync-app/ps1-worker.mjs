import {parentPort,workerData} from 'node:worker_threads';
import {loadDataset,solve} from './ps1.mjs';
try {parentPort.postMessage({result:solve(loadDataset(workerData.files),workerData.scenario)});}
catch(error){parentPort.postMessage({error:error.message});}
