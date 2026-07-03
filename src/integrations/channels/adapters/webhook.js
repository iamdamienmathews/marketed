// src/integrations/channels/adapters/webhook.js
// The one channel adapter that works with zero third-party developer
// account: it GETs a URL you control (e.g. a small script the client
// already has, a Zapier/Make webhook, or an internal reporting endpoint)
// and expects a flat JSON object of numeric metrics back, e.g.:
//   { "spend": 412.50, "clicks": 1834, "ctr": 0.024, "conversions": 61 }
// Use this for any channel that doesn't have a dedicated adapter yet —
// point it at a middleware endpoint that itself calls the real platform.

async function fetchMetrics(credentials) {
  const { url, headerName, headerValue } = credentials;
  if (!url) throw new Error('Webhook adapter requires a "url" in credentials.');

  const headers = {};
  if (headerName && headerValue) headers[headerName] = headerValue;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Webhook returned ${res.status}`);
  const data = await res.json();

  const metrics = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'number') metrics[key] = value;
  }
  return metrics;
}

module.exports = { fetchMetrics };
