import { createApp } from '../railsync-app/server.mjs';

// This adapter is a disposable demo: each Vercel instance has its own SQLite
// file. Durable hosting requires the Docker deployment or a remote DB adapter.
const aliases = [process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL]
  .filter(Boolean)
  .map((host) => `https://${host}`);
const origin = process.env.RAILSYNC_PUBLIC_ORIGIN || aliases[0] || '';
const dbPath =
  process.env.RAILSYNC_DB ||
  (process.env.VERCEL ? '/tmp/railsync.sqlite' : '.local/vercel-demo.sqlite');
const app = createApp({
  dbPath,
  publicOrigin: origin,
  setupToken: process.env.RAILSYNC_SETUP_TOKEN || '',
  additionalOrigins: aliases,
  ephemeral: !!process.env.VERCEL,
});

export default async function handler(req, res) {
  await new Promise((resolve, reject) => {
    res.once('finish', resolve);
    res.once('close', resolve);
    try {
      app.server.emit('request', req, res);
    } catch (error) {
      reject(error);
    }
  });
}
