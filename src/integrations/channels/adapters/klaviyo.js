// src/integrations/channels/adapters/klaviyo.js
// Real Klaviyo API call for email performance metrics.
// Requires a private API key from the client's Klaviyo account
// (Settings > API Keys). Docs: https://developers.klaviyo.com/en/reference/query_metric_aggregates
//
// credentials shape expected: { apiKey: 'pk_...' }

async function fetchMetrics(credentials) {
  const { apiKey } = credentials;
  if (!apiKey) throw new Error('Klaviyo adapter requires an apiKey.');

  const res = await fetch('https://a.klaviyo.com/api/campaign-values-reports/', {
    method: 'POST',
    headers: {
      Authorization: `Klaviyo-API-Key ${apiKey}`,
      revision: '2024-10-15',
      'Content-Type': 'application/vnd.api+json',
    },
    body: JSON.stringify({
      data: {
        type: 'campaign-values-report',
        attributes: {
          statistics: ['open_rate', 'click_rate', 'conversions'],
          timeframe: { key: 'last_7_days' },
        },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Klaviyo API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const results = data.data?.attributes?.results || [];
  const totals = results.reduce(
    (acc, r) => ({
      open_rate: r.statistics?.open_rate ?? acc.open_rate,
      click_rate: r.statistics?.click_rate ?? acc.click_rate,
      conversions: acc.conversions + (r.statistics?.conversions || 0),
    }),
    { open_rate: 0, click_rate: 0, conversions: 0 }
  );

  return totals;
}

module.exports = { fetchMetrics };
