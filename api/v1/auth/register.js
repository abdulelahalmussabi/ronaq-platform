const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const sbEnv = require('../../_lib/supabase-env');

function getStep(req) {
  var url = req.url || '';
  if (url.indexOf('register-verify') !== -1 || req.query.step === 'verify') return 'verify';
  return 'challenge';
}

async function handleChallenge(req, res) {
  const { staffId, staffPhone } = req.body || {};
  if (!staffId || !staffPhone) {
    return res.status(400).json({ error: 'Missing staff credentials' });
  }

  const challenge = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + 5 * 60 * 1000;
  const secret = sbEnv.getSupabaseServiceKey() || 'mken_auth_fallback_secret';
  const hmac = crypto.createHmac('sha256', secret)
    .update(challenge + ':' + expiresAt + ':' + staffId)
    .digest('hex');

  return res.status(200).json({
    challenge: challenge,
    expiresAt: expiresAt,
    challengeSignature: hmac,
    rp: {
      name: 'منصة مكِّن (mken)',
      id: req.headers.host.split(':')[0],
    },
    user: {
      id: Buffer.from(staffId).toString('base64url'),
      name: staffPhone,
      displayName: staffPhone,
    },
  });
}

async function handleVerify(req, res) {
  const {
    staffId,
    deviceName,
    credentialId,
    publicKeyDer,
    challenge,
    expiresAt,
    challengeSignature,
  } = req.body || {};

  if (!staffId || !deviceName || !credentialId || !publicKeyDer || !challenge || !expiresAt || !challengeSignature) {
    return res.status(400).json({ error: 'Missing verification fields' });
  }

  const secret = sbEnv.getSupabaseServiceKey() || 'mken_auth_fallback_secret';
  const expectedHmac = crypto.createHmac('sha256', secret)
    .update(challenge + ':' + expiresAt + ':' + staffId)
    .digest('hex');

  if (challengeSignature !== expectedHmac) {
    return res.status(400).json({ error: 'Invalid challenge signature' });
  }

  if (Date.now() > expiresAt) {
    return res.status(400).json({ error: 'Challenge expired' });
  }

  const supabaseUrl = sbEnv.getSupabaseUrl();
  const supabaseServiceKey = sbEnv.getSupabaseServiceKey();
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const deviceId = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  const { error } = await supabase
    .from('mken_staff_devices')
    .insert({
      id: deviceId,
      staff_id: staffId,
      device_name: deviceName,
      credential_id: credentialId,
      public_key: publicKeyDer,
    });

  if (error) throw error;
  return res.status(200).json({ success: true, deviceId: deviceId });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    if (getStep(req) === 'verify') {
      return await handleVerify(req, res);
    }
    return await handleChallenge(req, res);
  } catch (err) {
    console.error('Register auth failed:', err.message);
    return res.status(500).json({ error: 'Internal Server Error: ' + err.message });
  }
};
