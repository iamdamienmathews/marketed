// src/integrations/channels/adapters/semrush.js
// Real SEMrush Analytics API call for domain SEO metrics. Requires a
// SEMrush API key tied to a paid plan with API access.
// Docs: https://developer.semrush.com/api/v3/analytics/domain-reports/
//
// credentials shape expected: { apiKey: '...', domain: 'client-site.com' }

async function fetchMetrics(credentials) {
  const { apiKey, domain } = credentials;
  if (!apiKey || !domain) throw new Error('SEMrush adapter requires apiKey and domain.');

  const url = `https://api.semrush.com/?type=domain_ranks&key=${apiKey}&export_columns=Or,Ot,Oc,Ad&domain=${encodeURIComponent(domain)}&database=us`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`SEMrush API error ${res.status}`);
  const text = await res.text();

  const lines = text.trim().split('\n');
  if (lines.length < 2) return { organic_keywords: 0, organic_traffic: 0, organic_cost: 0, ads_keywords: 0 };

  const [orKeywords, orTraffic, orCost, adKeywords] = lines[1].split(';').map(Number);
  return {
    organic_keywords: orKeywords || 0,
    organic_traffic: orTraffic || 0,
    organic_cost: orCost || 0,
    ads_keywords: adKeywords || 0,
  };
}

module.exports = { fetchMetrics };
