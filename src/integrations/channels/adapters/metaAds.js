// src/integrations/channels/adapters/metaAds.js
// Real Meta (Facebook/Instagram) Marketing API call via the Graph API.
// Requires: a Meta developer app with the Ads Management Standard Access
// (or Advanced Access after App Review), and a long-lived access token
// for the ad account you're reporting on.
// Docs: https://developers.facebook.com/docs/marketing-api/insights
//
// credentials shape expected in client_channels.credentials_encrypted:
//   { adAccountId: 'act_1234567890', accessToken: 'EAAB...' }

async function fetchMetrics(credentials) {
  const { adAccountId, accessToken } = credentials;
  if (!adAccountId || !accessToken) {
    throw new Error('Meta Ads adapter requires adAccountId and accessToken.');
  }

  const fields = 'spend,clicks,ctr,actions';
  const url = `https://graph.facebook.com/v19.0/${adAccountId}/insights?fields=${fields}&date_preset=last_7d&access_token=${accessToken}`;

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta Ads API error ${res.status}: ${body}`);
  }
  const data = await res.json();
  const row = data.data && data.data[0];
  if (!row) return { spend: 0, clicks: 0, ctr: 0, conversions: 0 };

  const conversions = (row.actions || []).reduce(
    (sum, a) => (a.action_type === 'offsite_conversion' ? sum + Number(a.value) : sum),
    0
  );

  return {
    spend: Number(row.spend || 0),
    clicks: Number(row.clicks || 0),
    ctr: Number(row.ctr || 0),
    conversions,
  };
}

module.exports = { fetchMetrics };
