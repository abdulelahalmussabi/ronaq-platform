const { createClient } = require('@supabase/supabase-js');
const sbEnv = require('./_lib/supabase-env');
const { getValidAccessToken } = require('./_lib/google-auth-helper');

function corsGet(res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
}

function corsPost(res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
}

function getAction(req) {
  var url = req.url || '';
  if (url.indexOf('/callback') !== -1 || req.query.action === 'callback') return 'callback';
  if (url.indexOf('/locations') !== -1 || req.query.action === 'locations') return 'locations';
  if (url.indexOf('/update-website') !== -1 || req.query.action === 'update-website') return 'update-website';
  if (url.indexOf('/auth-url') !== -1 || req.query.action === 'auth-url') return 'auth-url';
  if (req.query.code && req.query.state) return 'callback';
  return 'auth-url';
}

async function handleAuthUrl(req, res) {
  const { tenant } = req.query;
  if (!tenant) {
    return res.status(400).json({ error: 'Tenant parameter is required' });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return res.status(500).json({
      error: 'Google OAuth is not configured on the server. Please check environment variables (GOOGLE_CLIENT_ID, GOOGLE_REDIRECT_URI).',
    });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/business.manage',
    access_type: 'offline',
    prompt: 'consent',
    state: tenant,
  });

  return res.status(200).json({ url: 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString() });
}

async function handleCallback(req, res) {
  const code = req.query.code;
  const state = req.query.state;
  const error = req.query.error;
  const host = req.headers.host || 'mken.live';
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const baseRedirectUrl = protocol + '://' + host + '/admin.html';

  if (error) {
    return res.redirect(baseRedirectUrl + '?google_connect=error&error_desc=' + encodeURIComponent(error));
  }

  if (!code || !state) {
    return res.redirect(baseRedirectUrl + '?google_connect=error&error_desc=' + encodeURIComponent('Missing code or state parameter'));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google OAuth credentials not configured on the server');
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });

  if (!tokenRes.ok) {
    throw new Error('Google token exchange failed: ' + (await tokenRes.text()));
  }

  const tokenData = await tokenRes.json();
  const expiryDate = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();
  const supabase = createClient(sbEnv.getSupabaseUrl(), sbEnv.getSupabaseServiceKey());

  const { data: clientData, error: fetchError } = await supabase
    .from('mken_saas_clients')
    .select('google_refresh_token')
    .eq('tenant_slug', state)
    .single();

  if (fetchError || !clientData) {
    throw new Error('Tenant client not found in database: ' + state);
  }

  const updateData = {
    google_access_token: tokenData.access_token,
    google_token_expiry: expiryDate,
    updated_at: new Date().toISOString(),
  };
  if (tokenData.refresh_token) {
    updateData.google_refresh_token = tokenData.refresh_token;
  }

  const { error: updateError } = await supabase
    .from('mken_saas_clients')
    .update(updateData)
    .eq('tenant_slug', state);

  if (updateError) throw updateError;
  return res.redirect(baseRedirectUrl + '?tenant=' + encodeURIComponent(state) + '&google_connect=success');
}

async function handleLocations(req, res) {
  const { tenant } = req.query;
  if (!tenant) {
    return res.status(400).json({ error: 'Tenant parameter is required' });
  }

  let accessToken;
  try {
    accessToken = await getValidAccessToken(tenant);
  } catch (authErr) {
    if (authErr.message.includes('not connected')) {
      return res.status(200).json({ connected: false, locations: [] });
    }
    throw authErr;
  }

  const supabase = createClient(sbEnv.getSupabaseUrl(), sbEnv.getSupabaseServiceKey());
  const { data: client } = await supabase
    .from('mken_saas_clients')
    .select('google_business_location_id')
    .eq('tenant_slug', tenant)
    .single();

  const accountsRes = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
    headers: { Authorization: 'Bearer ' + accessToken },
  });

  if (!accountsRes.ok) {
    throw new Error('Failed to fetch Google accounts: ' + (await accountsRes.text()));
  }

  const accountsData = await accountsRes.json();
  let allLocations = [];

  for (const account of (accountsData.accounts || [])) {
    const locationsRes = await fetch(
      'https://mybusinessbusinessinformation.googleapis.com/v1/' + account.name + '/locations?readMask=name,title,websiteUri',
      { headers: { Authorization: 'Bearer ' + accessToken } }
    );

    if (locationsRes.ok) {
      const locationsData = await locationsRes.json();
      allLocations = allLocations.concat((locationsData.locations || []).map(function (loc) {
        return { id: loc.name, title: loc.title, websiteUri: loc.websiteUri || '' };
      }));
    }
  }

  return res.status(200).json({
    connected: true,
    selectedLocationId: client ? client.google_business_location_id : null,
    locations: allLocations,
  });
}

async function handleUpdateWebsite(req, res) {
  const { tenant, locationId, websiteUrl, action } = req.body || {};
  if (!tenant) {
    return res.status(400).json({ error: 'Tenant parameter is required' });
  }

  const supabase = createClient(sbEnv.getSupabaseUrl(), sbEnv.getSupabaseServiceKey());

  if (action === 'disconnect') {
    const { error: updateError } = await supabase
      .from('mken_saas_clients')
      .update({
        google_access_token: null,
        google_refresh_token: null,
        google_token_expiry: null,
        google_business_location_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_slug', tenant);

    if (updateError) throw updateError;
    return res.status(200).json({ success: true, message: 'Disconnected Google account successfully' });
  }

  if (!locationId || !websiteUrl) {
    return res.status(400).json({ error: 'locationId and websiteUrl are required for update action' });
  }

  const accessToken = await getValidAccessToken(tenant);
  const googleApiUrl = 'https://mybusinessbusinessinformation.googleapis.com/v1/' + locationId + '?updateMask=websiteUri';
  const updateRes = await fetch(googleApiUrl, {
    method: 'PATCH',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ websiteUri: websiteUrl }),
  });

  if (!updateRes.ok) {
    throw new Error('Google API update failed: ' + (await updateRes.text()));
  }

  const { error: dbError } = await supabase
    .from('mken_saas_clients')
    .update({
      google_business_location_id: locationId,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_slug', tenant);

  if (dbError) throw dbError;
  return res.status(200).json({ success: true, message: 'Website URL updated successfully on Google Business Profile' });
}

module.exports = async function handler(req, res) {
  const action = getAction(req);

  if (action === 'callback') {
    try {
      return await handleCallback(req, res);
    } catch (err) {
      console.error('OAuth Callback Error:', err);
      const state = req.query.state || '';
      const host = req.headers.host || 'mken.live';
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      return res.redirect(protocol + '://' + host + '/admin.html?tenant=' + encodeURIComponent(state) + '&google_connect=error&error_desc=' + encodeURIComponent(err.message));
    }
  }

  if (action === 'update-website') {
    corsPost(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    try {
      return await handleUpdateWebsite(req, res);
    } catch (err) {
      console.error('Update Google Business Error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  corsGet(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    if (action === 'locations') return await handleLocations(req, res);
    return await handleAuthUrl(req, res);
  } catch (err) {
    console.error('Google Business Error:', err);
    return res.status(500).json({ error: err.message });
  }
};
