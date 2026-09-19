import { createApp } from '../railsync-app/server.mjs';
import { hostingOptions } from '../railsync-app/deployment.mjs';

// SUPABASE_DB_URL enables durable shared state for this adapter too.
const dbPath =
  process.env.RAILSYNC_DB ||
  (process.env.VERCEL ? '/tmp/railsync.sqlite' : '.local/vercel-demo.sqlite');
const app = await createApp({
  dbPath,
  ...hostingOptions(),
  setupToken: process.env.RAILSYNC_SETUP_TOKEN || '',
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
