import { Worker } from 'node:worker_threads';

export function runSolver(files, scenario, constraints = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./ps1-worker.mjs', import.meta.url), {
      workerData: { files, scenario, constraints },
    });
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      error ? reject(error) : resolve(result);
    };
    const timeout = setTimeout(() => {
      void worker.terminate();
      finish(
        Object.assign(Error('Planning reached the 60-second limit. The saved plan is unchanged.'), {
          status: 422,
        }),
      );
    }, 60000);
    worker.once('message', (message) =>
      finish(
        message.error ? Object.assign(Error(message.error), { status: 422 }) : null,
        message.result,
      ),
    );
    worker.once('error', (error) => finish(error));
    worker.once('exit', () => {
      if (!settled) finish(Error('Solver worker stopped without a result.'));
    });
  });
}
