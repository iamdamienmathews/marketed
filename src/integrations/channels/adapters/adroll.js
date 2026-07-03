// src/integrations/channels/adapters/adroll.js
// Real AdRoll API call for retargeting performance. Requires an AdRoll
// OAuth2 app and a stored access token for the client's advertiser
// account. Docs: https://developer.adroll.com/reference/reporting-api
//
// credentials shape expected: { advertisableEid: '...', accessToken: '...' }

async function fetchMetrics(credentials) {
  const { advertisableEid, accessToken } = credentials;
  if (!advertisableEid || !accessToken) {
    throw new Error('AdRoll adapter requires advertisableEid and accessToken.');
  }

  const url = `https://services.adroll.com/api/v1/report/ad/${advertisableEid}?access_token=${accessToken}&days=7`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`AdRoll API error ${res.status}`);
  const data = await res.json();

  const rows = data.results || [];
  const totals = rows.reduce(
    (acc, r) => ({
      spend: acc.spend + Number(r.spend || 0),
      impressions: acc.impressions + Number(r.impressions || 0),
      clicks: acc.clicks + Number(r.clicks || 0),
      conversions: acc.conversions + Number(r.conversions || 0),
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
  );

  return totals;
}

module.exports = { fetchMetrics };
