export function deploymentConfig(origin = '') {
  if (!origin) return { origin: null, host: null, secure: false };
  let url;
  try {
    url = new URL(origin);
  } catch {
    throw Error('RAILSYNC_PUBLIC_ORIGIN must be an HTTPS origin');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw Error('RAILSYNC_PUBLIC_ORIGIN must be an HTTPS origin without a path or credentials');
  return { origin: url.origin, host: url.host, secure: true };
}

export function requestOrigin(host, config) {
  for (const allowed of [config, ...(config.alternatives || [])]) {
    if (allowed.host && host === allowed.host) return allowed.origin;
  }
  if (/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return 'http://' + host;
  return null;
}
