const { createClient } = require('@supabase/supabase-js');
const sbEnv = require('../_lib/supabase-env');
const pushLib = require('../_lib/web-push');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function getAction(req) {
  var url = req.url || '';
  if (url.indexOf('push-subscribe') !== -1 || req.query.action === 'subscribe') return 'subscribe';
  if (url.indexOf('push-notify') !== -1 || req.query.action === 'notify') return 'notify';
  if (url.indexOf('push-test') !== -1 || req.query.action === 'test') return 'test';
  return '';
}

async function handleSubscribe(req, res) {
  const body = req.body || {};
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : '';
  const keys = body.keys;
  const tenantSlug = (body.tenantSlug || body.tenant_slug || 'default').trim() || 'default';

  if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
    return res.status(400).json({ error: 'Missing endpoint or keys' });
  }

  const supabaseUrl = sbEnv.getSupabaseUrl();
  const supabaseKey = sbEnv.getSupabaseServiceKey();
  const supabase = createClient(supabaseUrl, supabaseKey);

  const enabled = await pushLib.isPushEnabledForTenant(supabase, tenantSlug);
  if (!enabled) {
    return res.status(400).json({ error: 'Push not enabled for this tenant' });
  }

  const row = {
    tenant_slug: tenantSlug,
    endpoint,
    keys,
    label: typeof body.label === 'string' ? body.label.slice(0, 40) : 'admin',
    user_agent: typeof body.userAgent === 'string' ? body.userAgent.slice(0, 200) : null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('mken_push_subscriptions')
    .upsert(row, { onConflict: 'endpoint' });

  if (error) throw error;
  return res.status(200).json({ ok: true, tenantSlug });
}

async function handleNotify(req, res) {
  const body = req.body || {};
  const tenantSlug = (body.tenantSlug || body.tenant_slug || 'default').trim() || 'default';
  const title = typeof body.title === 'string' ? body.title.slice(0, 120) : 'مكِّن';
  const text = typeof body.body === 'string' ? body.body.slice(0, 500) : '';
  const url = typeof body.url === 'string' ? body.url.slice(0, 200) : './admin.html';

  const supabaseUrl = sbEnv.getSupabaseUrl();
  const supabaseKey = sbEnv.getSupabaseServiceKey();
  const supabase = createClient(supabaseUrl, supabaseKey);

  const result = await pushLib.sendPushToTenant(supabase, tenantSlug, title, text, url);
  return res.status(200).json({ ok: true, ...result });
}

async function handleTest(req, res) {
  if (!pushLib.isPushConfigured()) {
    return res.status(503).json({
      error: 'VAPID keys missing on server. Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Vercel.',
    });
  }

  const body = req.body || {};
  const tenantSlug = (body.tenantSlug || body.tenant_slug || 'default').trim() || 'default';
  const supabaseUrl = sbEnv.getSupabaseUrl();
  const supabaseKey = sbEnv.getSupabaseServiceKey();
  const supabase = createClient(supabaseUrl, supabaseKey);

  const result = await pushLib.sendPushToTenant(
    supabase,
    tenantSlug,
    'اختبار Push — مكِّن',
    'تم إعداد التنبيهات بنجاح. ستصلك إشعارات الحجوزات والتذكيرات هنا.',
    './admin.html'
  );

  if (result.skipped === 'no-subscriptions') {
    return res.status(404).json({
      error: 'لا توجد اشتراكات. اضغط «اشتراك هذا الجهاز» أولاً.',
      ...result,
    });
  }

  if (result.skipped) {
    return res.status(400).json({ error: result.skipped, ...result });
  }

  return res.status(200).json({ ok: true, message: 'تم إرسال إشعار الاختبار', ...result });
}

module.exports = async function handler(req, res) {
  cors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = sbEnv.getSupabaseUrl();
  const supabaseKey = sbEnv.getSupabaseServiceKey();
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const action = getAction(req);
  if (!action) {
    return res.status(400).json({ error: 'Unknown push action' });
  }

  try {
    if (action === 'subscribe') return await handleSubscribe(req, res);
    if (action === 'notify') return await handleNotify(req, res);
    if (action === 'test') return await handleTest(req, res);
  } catch (err) {
    console.error('[push]', action, err.message);
    return res.status(500).json({ error: err.message || 'Push request failed' });
  }
};
