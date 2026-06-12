const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { 
    tenantSlug,
    phone,
    credentialId, 
    clientDataJSON, 
    authenticatorData, 
    signature, 
    challenge, 
    expiresAt, 
    challengeSignature 
  } = req.body || {};

  if (!tenantSlug || !phone || !credentialId || !clientDataJSON || !authenticatorData || !signature || !challenge || !expiresAt || !challengeSignature) {
    return res.status(400).json({ error: 'Missing verification fields' });
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

    // 2. Verify challenge signature
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mken_auth_fallback_secret';
    const expectedHmac = crypto.createHmac('sha256', secret)
      .update(challenge + ':' + expiresAt + ':' + staff.id)
      .digest('hex');

    if (challengeSignature !== expectedHmac) {
      return res.status(400).json({ error: 'Invalid challenge signature' });
    }

    if (Date.now() > expiresAt) {
      return res.status(400).json({ error: 'Challenge expired' });
    }

    // 3. Fetch device public key
    const { data: device, error: devErr } = await supabase
      .from('ronaq_staff_devices')
      .select('*')
      .eq('staff_id', staff.id)
      .eq('credential_id', credentialId)
      .maybeSingle();

    if (devErr) throw devErr;
    if (!device) {
      return res.status(400).json({ error: 'Credential not found for this staff member' });
    }

    // 4. Verify assertion signature using Node's crypto
    const clientDataHash = crypto.createHash('sha256')
      .update(Buffer.from(clientDataJSON, 'base64'))
      .digest();
    
    const verifyData = Buffer.concat([
      Buffer.from(authenticatorData, 'base64'), 
      clientDataHash
    ]);

    const pem = `-----BEGIN PUBLIC KEY-----\n${device.public_key}\n-----END PUBLIC KEY-----`;

    const verify = crypto.createVerify('SHA256');
    verify.update(verifyData);
    
    // WebAuthn assertion signature is standard ECDSA (ASN.1 DER format)
    const isValid = verify.verify(pem, Buffer.from(signature, 'base64'));

    if (!isValid) {
      return res.status(400).json({ error: 'Biometric verification failed (invalid signature)' });
    }

    // 5. Success: return session credentials
    return res.status(200).json({
      success: true,
      staff: {
        id: staff.id,
        name: staff.name,
        role: staff.role,
        phone: staff.phone,
        tenantSlug: staff.tenant_slug
      }
    });
  } catch (err) {
    console.error('Biometric login verification failed:', err.message);
    return res.status(500).json({ error: 'Internal Server Error: ' + err.message });
  }
};
