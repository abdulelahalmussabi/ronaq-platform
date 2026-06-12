const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { tenantSlug, phone } = req.body || {};
  if (!tenantSlug || !phone) {
    return res.status(400).json({ error: 'Missing tenant or phone number' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Database configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // 1. Fetch staff member
    const { data: staff, error: staffErr } = await supabase
      .from('ronaq_staff')
      .select('*')
      .eq('tenant_slug', tenantSlug)
      .eq('phone', phone)
      .eq('status', 'active')
      .maybeSingle();

    if (staffErr) throw staffErr;
    if (!staff) {
      return res.status(404).json({ error: 'Staff member not found or inactive' });
    }

    // 2. Fetch registered devices/credentials
    const { data: devices, error: devErr } = await supabase
      .from('ronaq_staff_devices')
      .select('credential_id')
      .eq('staff_id', staff.id);

    if (devErr) throw devErr;

    if (!devices || !devices.length) {
      return res.status(400).json({ error: 'No biometric credentials registered for this staff member' });
    }

    // 3. Generate challenge
    const challenge = crypto.randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + 5 * 60 * 1000;

    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mken_auth_fallback_secret';
    const hmac = crypto.createHmac('sha256', secret)
      .update(challenge + ':' + expiresAt + ':' + staff.id)
      .digest('hex');

    return res.status(200).json({
      challenge: challenge,
      expiresAt: expiresAt,
      challengeSignature: hmac,
      allowCredentials: devices.map(d => ({
        type: 'public-key',
        id: d.credential_id
      }))
    });
  } catch (err) {
    console.error('Login challenge failed:', err.message);
    return res.status(500).json({ error: 'Internal Server Error: ' + err.message });
  }
};
