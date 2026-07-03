// src/integrations/channels/adapters/googleAds.js
// Google Ads reporting requires a Google Ads Developer Token (apply for
// one inside your Google Ads manager account — approval can take a few
// days) plus OAuth credentials for the account being reported on.
// Uses the community-maintained `google-ads-api` npm package, which wraps
// Google's official gRPC API in a usable Node interface.
// Docs: https://developers.google.com/google-ads/api/docs/start
//
// credentials shape expected:
//   { customerId: '123-456-7890', refreshToken: '1//...' }
//
// Install when you're ready to wire this up for real:
//   npm install google-ads-api

async function fetchMetrics(credentials) {
  const { customerId, refreshToken } = credentials;
  if (!customerId || !refreshToken) {
    throw new Error('Google Ads adapter requires customerId and refreshToken.');
  }
  if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN || !process.env.GOOGLE_CLIENT_ID) {
    throw new Error(
      'Google Ads adapter requires GOOGLE_ADS_DEVELOPER_TOKEN and GOOGLE_CLIENT_ID/SECRET in .env.'
    );
  }

  // Lazy-required so the app runs fine without this package installed
  // until you actually connect a Google Ads client.
  const { GoogleAdsApi } = require('google-ads-api');

  const client = new GoogleAdsApi({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  });

  const customer = client.Customer({ customer_id: customerId, refresh_token: refreshToken });

  const rows = await customer.query(`
    SELECT metrics.cost_micros, metrics.clicks, metrics.ctr, metrics.conversions
    FROM customer
    WHERE segments.date DURING LAST_7_DAYS
  `);

  const totals = rows.reduce(
    (acc, r) => ({
      spend: acc.spend + Number(r.metrics.cost_micros || 0) / 1_000_000,
      clicks: acc.clicks + Number(r.metrics.clicks || 0),
      ctr: r.metrics.ctr || acc.ctr,
      conversions: acc.conversions + Number(r.metrics.conversions || 0),
    }),
    { spend: 0, clicks: 0, ctr: 0, conversions: 0 }
  );

  return totals;
}

module.exports = { fetchMetrics };
