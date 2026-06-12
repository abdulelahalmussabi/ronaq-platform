const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { 
    staffId, 
    deviceName, 
    credentialId, 
    publicKeyDer, 
    challenge, 
    expiresAt, 
    challengeSignature 
  } = req.body || {};

  if (!staffId || !deviceName || !credentialId || !publicKeyDer || !challenge || !expiresAt || !challengeSignature) {
    return res.status(400).json({ error: 'Missing verification fields' });
  }

  // 1. Verify challenge signature
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mken_auth_fallback_secret';
  const expectedHmac = crypto.createHmac('sha256', secret)
    .update(challenge + ':' + expiresAt + ':' + staffId)
    .digest('hex');

  if (challengeSignature !== expectedHmac) {
    return res.status(400).json({ error: 'Invalid challenge signature' });
  }

  if (Date.now() > expiresAt) {
    return res.status(400).json({ error: 'Challenge expired' });
  }

  // 2. Connect to Supabase
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Database credentials missing' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // 3. Save device and public key in DB
    const deviceId = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    const { error } = await supabase
      .from('ronaq_staff_devices')
      .insert({
        id: deviceId,
        staff_id: staffId,
        device_name: deviceName,
        credential_id: credentialId,
        public_key: publicKeyDer
      });

    if (error) throw error;

    return res.status(200).json({ success: true, deviceId: deviceId });
  } catch (err) {
    console.error('Failed to register device:', err.message);
    return res.status(500).json({ error: 'Internal Server Error: ' + err.message });
  }
};
