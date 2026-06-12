const crypto = require('crypto');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { staffId, staffPhone } = req.body || {};
  if (!staffId || !staffPhone) {
    return res.status(400).json({ error: 'Missing staff credentials' });
  }

  const challenge = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes validity
  
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mken_auth_fallback_secret';
  const hmac = crypto.createHmac('sha256', secret)
    .update(challenge + ':' + expiresAt + ':' + staffId)
    .digest('hex');

  return res.status(200).json({
    challenge: challenge,
    expiresAt: expiresAt,
    challengeSignature: hmac,
    rp: {
      name: "منصة مكِّن (mken)",
      id: req.headers.host.split(':')[0]
    },
    user: {
      id: Buffer.from(staffId).toString('base64url'),
      name: staffPhone,
      displayName: staffPhone
    }
  });
};
