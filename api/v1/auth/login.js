const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const sbEnv = require('../../_lib/supabase-env');

function getStep(req) {
  var url = req.url || '';
  if (url.indexOf('login-verify') !== -1 || req.query.step === 'verify') return 'verify';
  return 'challenge';
}

async function handleChallenge(req, res) {
  const { tenantSlug, phone } = req.body || {};
  if (!tenantSlug || !phone) {
    return res.status(400).json({ error: 'Missing tenant or phone number' });
  }

  const supabaseUrl = sbEnv.getSupabaseUrl();
  const supabaseKey = sbEnv.getSupabaseServiceKey();
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: staff, error: staffErr } = await supabase
    .from('mken_staff')
    .select('*')
    .eq('tenant_slug', tenantSlug)
    .eq('phone', phone)
    .eq('status', 'active')
    .maybeSingle();

  if (staffErr) throw staffErr;
  if (!staff) {
    return res.status(404).json({ error: 'Staff member not found or inactive' });
  }

  const { data: devices, error: devErr } = await supabase
    .from('mken_staff_devices')
    .select('credential_id')
    .eq('staff_id', staff.id);

  if (devErr) throw devErr;
  if (!devices || !devices.length) {
    return res.status(400).json({ error: 'No biometric credentials registered for this staff member' });
  }

  const challenge = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + 5 * 60 * 1000;
  const secret = sbEnv.getSupabaseServiceKey() || 'mken_auth_fallback_secret';
  const hmac = crypto.createHmac('sha256', secret)
    .update(challenge + ':' + expiresAt + ':' + staff.id)
    .digest('hex');

  return res.status(200).json({
    challenge: challenge,
    expiresAt: expiresAt,
    challengeSignature: hmac,
    allowCredentials: devices.map(function (d) {
      return { type: 'public-key', id: d.credential_id };
    }),
  });
}

async function handleVerify(req, res) {
  const {
    tenantSlug,
    phone,
    credentialId,
    clientDataJSON,
    authenticatorData,
    signature,
    challenge,
    expiresAt,
    challengeSignature,
  } = req.body || {};

  if (!tenantSlug || !phone || !credentialId || !clientDataJSON || !authenticatorData || !signature || !challenge || !expiresAt || !challengeSignature) {
    return res.status(400).json({ error: 'Missing verification fields' });
  }

  const supabaseUrl = sbEnv.getSupabaseUrl();
  const supabaseKey = sbEnv.getSupabaseServiceKey();
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: staff, error: staffErr } = await supabase
    .from('mken_staff')
    .select('*')
    .eq('tenant_slug', tenantSlug)
    .eq('phone', phone)
    .eq('status', 'active')
    .maybeSingle();

  if (staffErr) throw staffErr;
  if (!staff) {
    return res.status(404).json({ error: 'Staff member not found or inactive' });
  }

  const secret = sbEnv.getSupabaseServiceKey() || 'mken_auth_fallback_secret';
  const expectedHmac = crypto.createHmac('sha256', secret)
    .update(challenge + ':' + expiresAt + ':' + staff.id)
    .digest('hex');

  if (challengeSignature !== expectedHmac) {
    return res.status(400).json({ error: 'Invalid challenge signature' });
  }

  if (Date.now() > expiresAt) {
    return res.status(400).json({ error: 'Challenge expired' });
  }

  const { data: device, error: devErr } = await supabase
    .from('mken_staff_devices')
    .select('*')
    .eq('staff_id', staff.id)
    .eq('credential_id', credentialId)
    .maybeSingle();

  if (devErr) throw devErr;
  if (!device) {
    return res.status(400).json({ error: 'Credential not found for this staff member' });
  }

  const clientDataHash = crypto.createHash('sha256')
    .update(Buffer.from(clientDataJSON, 'base64'))
    .digest();

  const verifyData = Buffer.concat([
    Buffer.from(authenticatorData, 'base64'),
    clientDataHash,
  ]);

  const pem = '-----BEGIN PUBLIC KEY-----\n' + device.public_key + '\n-----END PUBLIC KEY-----';
  const verify = crypto.createVerify('SHA256');
  verify.update(verifyData);
  const isValid = verify.verify(pem, Buffer.from(signature, 'base64'));

  if (!isValid) {
    return res.status(400).json({ error: 'Biometric verification failed (invalid signature)' });
  }

  return res.status(200).json({
    success: true,
    staff: {
      id: staff.id,
      name: staff.name,
      role: staff.role,
      phone: staff.phone,
      tenantSlug: staff.tenant_slug,
    },
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const supabaseUrl = sbEnv.getSupabaseUrl();
  const supabaseKey = sbEnv.getSupabaseServiceKey();
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Database configuration error' });
  }

  try {
    if (getStep(req) === 'verify') {
      return await handleVerify(req, res);
    }
    return await handleChallenge(req, res);
  } catch (err) {
    console.error('Login auth failed:', err.message);
    return res.status(500).json({ error: 'Internal Server Error: ' + err.message });
  }
};
