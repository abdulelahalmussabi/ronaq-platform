'use strict';

/**
 * مكن — خادم تفعيل وإدارة تراخيص Mken Lite
 *
 * نقاط عامة (للعميل Mken Lite):
 *   POST /api/license/activate    { licenseKey, machineId, hostname }  → توكن موقّع مربوط بالجهاز
 *   POST /api/license/verify      { licenseKey, machineId }            → حالة الترخيص + توكن محدّث (heartbeat)
 *   POST /api/license/deactivate  { licenseKey, machineId }            → فكّ ربط الجهاز (لنقل الترخيص)
 *
 * نقاط إدارية (تتطلب الهيدر X-Admin-Token = LICENSE_ADMIN_TOKEN):
 *   POST /api/license/issue       { plan, customerName, phone, email, months, maxDevices, billingCycle, notes }
 *   GET  /api/license/list        [?status=&q=]
 *   POST /api/license/revoke      { licenseKey }
 *   POST /api/license/suspend     { licenseKey }
 *   POST /api/license/resume      { licenseKey }
 */

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const sbEnv = require('./_lib/supabase-env');
const { handleCors } = require('./_lib/cors');
const { isRateLimited } = require('./_lib/rate-limit');
const sign = require('./_lib/license-sign');
const licenseIssue = require('./_lib/license-issue');

function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function getSupabase(res) {
  const url = sbEnv.getSupabaseUrl();
  const key = sbEnv.getSupabaseServiceKey();
  if (!url || !key) {
    res.status(500).json({ error: 'Supabase غير مهيّأ في البيئة' });
    return null;
  }
  return createClient(url, key);
}

function isAdmin(req) {
  const token = req.headers['x-admin-token'] || req.headers['X-Admin-Token'];
  const expected = process.env.LICENSE_ADMIN_TOKEN;
  if (!expected || !token) return false;
  const a = Buffer.from(String(token));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch (e) { return false; }
}

function logEvent(supabase, licenseKey, type, detail, ip) {
  return supabase.from('mken_license_events')
    .insert({ license_key: licenseKey || null, type: type, detail: detail || null, ip: ip || null })
    .then(function () {}, function () {}); // لا تُفشل العملية بسبب التدقيق
}

function buildToken(lic, machineId) {
  const exp = lic.expires_at ? new Date(lic.expires_at).getTime() : 0;
  return sign.signToken({
    k: lic.license_key,
    plan: lic.plan,
    mid: machineId,
    max: lic.max_devices,
    cust: lic.customer_name || '',
    iat: Date.now(),
    exp: exp
  });
}

function getAction(req) {
  if (req.query && req.query.action) return String(req.query.action);
  const url = req.url || '';
  const m = url.match(/\/api\/license\/([a-zA-Z]+)/);
  return m ? m[1] : '';
}

// ---------- العمليات العامة ----------
async function doActivate(req, res, supabase) {
  const ip = getClientIp(req);
  const rl = isRateLimited('lic_act_' + ip, 20, 60 * 1000);
  if (rl.limited) return res.status(429).json({ error: 'طلبات كثيرة، حاول لاحقاً', retryAfter: rl.retryAfterSec });

  const body = req.body || {};
  const licenseKey = (body.licenseKey || '').trim().toUpperCase();
  const machineId = (body.machineId || '').trim();
  const hostname = (body.hostname || '').trim();

  if (!licenseKey || !machineId) {
    return res.status(400).json({ error: 'licenseKey و machineId مطلوبان' });
  }

  const { data: lic, error } = await supabase
    .from('mken_licenses').select('*').eq('license_key', licenseKey).maybeSingle();
  if (error) throw error;
  if (!lic) {
    await logEvent(supabase, licenseKey, 'denied', { reason: 'not_found', machineId }, ip);
    return res.status(404).json({ error: 'مفتاح ترخيص غير صحيح' });
  }
  if (lic.status !== 'active') {
    await logEvent(supabase, licenseKey, 'denied', { reason: lic.status, machineId }, ip);
    return res.status(403).json({ error: 'الترخيص ' + (lic.status === 'revoked' ? 'ملغى' : 'موقوف') });
  }
  if (lic.expires_at && new Date(lic.expires_at) < new Date()) {
    await logEvent(supabase, licenseKey, 'denied', { reason: 'expired', machineId }, ip);
    return res.status(403).json({ error: 'انتهت صلاحية الترخيص', expiresAt: lic.expires_at });
  }

  // الأجهزة المربوطة
  const { data: devices, error: devErr } = await supabase
    .from('mken_license_devices').select('*').eq('license_key', licenseKey);
  if (devErr) throw devErr;

  const existing = (devices || []).find(function (d) { return d.machine_id === machineId; });
  if (!existing) {
    if ((devices || []).length >= lic.max_devices) {
      await logEvent(supabase, licenseKey, 'denied', { reason: 'device_limit', machineId, max: lic.max_devices }, ip);
      return res.status(409).json({
        error: 'تم بلوغ الحد الأقصى للأجهزة (' + lic.max_devices + '). فعِّل الترخيص على جهاز واحد فقط أو افكّ ربط جهاز آخر.',
        code: 'DEVICE_LIMIT'
      });
    }
    const { error: insErr } = await supabase.from('mken_license_devices')
      .insert({ license_key: licenseKey, machine_id: machineId, hostname: hostname });
    if (insErr) throw insErr;
  } else {
    await supabase.from('mken_license_devices')
      .update({ last_seen_at: new Date().toISOString(), hostname: hostname || existing.hostname })
      .eq('id', existing.id);
  }

  const token = buildToken(lic, machineId);
  await logEvent(supabase, licenseKey, 'activated', { machineId, hostname }, ip);

  return res.status(200).json({
    token: token,
    plan: lic.plan,
    customerName: lic.customer_name,
    maxDevices: lic.max_devices,
    expiresAt: lic.expires_at,
    publicKeyHint: 'verify offline with embedded LICENSE_PUBLIC_KEY'
  });
}

async function doVerify(req, res, supabase) {
  const ip = getClientIp(req);
  const body = req.body || {};
  const licenseKey = (body.licenseKey || '').trim().toUpperCase();
  const machineId = (body.machineId || '').trim();
  if (!licenseKey || !machineId) return res.status(400).json({ error: 'licenseKey و machineId مطلوبان' });

  const { data: lic, error } = await supabase
    .from('mken_licenses').select('*').eq('license_key', licenseKey).maybeSingle();
  if (error) throw error;
  if (!lic) return res.status(404).json({ valid: false, reason: 'not_found' });

  const { data: device } = await supabase.from('mken_license_devices')
    .select('id').eq('license_key', licenseKey).eq('machine_id', machineId).maybeSingle();

  const expired = lic.expires_at && new Date(lic.expires_at) < new Date();
  const valid = lic.status === 'active' && !expired && !!device;

  if (device) {
    await supabase.from('mken_license_devices')
      .update({ last_seen_at: new Date().toISOString() }).eq('id', device.id);
  }
  await logEvent(supabase, licenseKey, 'verified', { machineId, valid }, ip);

  return res.status(200).json({
    valid: valid,
    status: lic.status,
    expired: !!expired,
    boundToThisDevice: !!device,
    plan: lic.plan,
    expiresAt: lic.expires_at,
    token: valid ? buildToken(lic, machineId) : null
  });
}

async function doDeactivate(req, res, supabase) {
  const ip = getClientIp(req);
  const body = req.body || {};
  const licenseKey = (body.licenseKey || '').trim().toUpperCase();
  const machineId = (body.machineId || '').trim();
  if (!licenseKey || !machineId) return res.status(400).json({ error: 'licenseKey و machineId مطلوبان' });

  const { error } = await supabase.from('mken_license_devices')
    .delete().eq('license_key', licenseKey).eq('machine_id', machineId);
  if (error) throw error;
  await logEvent(supabase, licenseKey, 'deactivated', { machineId }, ip);
  return res.status(200).json({ success: true });
}

// ---------- العمليات الإدارية ----------
async function doIssue(req, res, supabase) {
  const body = req.body || {};
  const data = await licenseIssue.issueLicense(supabase, {
    plan: body.plan || 'Lite',
    customerName: body.customerName || body.customer_name,
    phone: body.phone || body.customer_phone,
    email: body.email || body.customer_email,
    months: body.months,
    maxDevices: body.maxDevices,
    billingCycle: body.billingCycle || 'annual',
    crNumber: body.crNumber || body.cr_number || body.commercialRegistryNumber || body.commercial_registry_number,
    taxNumber: body.taxNumber || body.tax_number,
    notes: body.notes,
    source: 'admin'
  });
  await logEvent(supabase, data.license_key, 'issued', { plan: data.plan, maxDevices: data.max_devices }, getClientIp(req));
  return res.status(201).json({ success: true, license: data });
}

async function doList(req, res, supabase) {
  const status = req.query.status;
  const q = req.query.q;
  let query = supabase.from('mken_licenses').select('*').order('created_at', { ascending: false }).limit(500);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;

  let licenses = data || [];
  if (q) {
    const ql = String(q).toLowerCase();
    licenses = licenses.filter(function (l) {
      return (l.license_key || '').toLowerCase().indexOf(ql) >= 0
        || (l.customer_name || '').toLowerCase().indexOf(ql) >= 0
        || (l.customer_phone || '').indexOf(ql) >= 0;
    });
  }

  // عدّ الأجهزة لكل ترخيص
  const { data: devices } = await supabase.from('mken_license_devices').select('license_key, machine_id, last_seen_at');
  const counts = {};
  (devices || []).forEach(function (d) { counts[d.license_key] = (counts[d.license_key] || 0) + 1; });
  licenses.forEach(function (l) { l.device_count = counts[l.license_key] || 0; });

  return res.status(200).json({ licenses: licenses });
}

async function doSetStatus(req, res, supabase, status, eventType) {
  const body = req.body || {};
  const licenseKey = (body.licenseKey || '').trim().toUpperCase();
  if (!licenseKey) return res.status(400).json({ error: 'licenseKey مطلوب' });
  const { data, error } = await supabase.from('mken_licenses')
    .update({ status: status, updated_at: new Date().toISOString() })
    .eq('license_key', licenseKey).select().maybeSingle();
  if (error) throw error;
  if (!data) return res.status(404).json({ error: 'ترخيص غير موجود' });
  await logEvent(supabase, licenseKey, eventType, null, getClientIp(req));
  return res.status(200).json({ success: true, license: data });
}

function publicPlans() {
  return Object.keys(licenseIssue.PLANS).map(function (key) {
    const p = licenseIssue.PLANS[key];
    return {
      key: key, label: p.label,
      annual: p.annual, perpetual: p.perpetual,
      maxDevices: p.maxDevices
    };
  });
}

async function doCheckoutConfig(req, res) {
  return res.status(200).json({
    publishableKey: process.env.MOYASAR_PUBLISHABLE_KEY || '',
    currency: '﷼',
    plans: publicPlans()
  });
}

async function doCheckoutStatus(req, res, supabase) {
  const paymentId = (req.query.paymentId || req.query.payment_id || '').trim();
  if (!paymentId) return res.status(400).json({ error: 'paymentId مطلوب' });

  const secret = process.env.MOYASAR_SECRET_KEY;
  if (!secret) return res.status(500).json({ error: 'مفتاح Moyasar غير مهيّأ' });

  let payment;
  try {
    const auth = Buffer.from(secret + ':').toString('base64');
    const r = await fetch('https://api.moyasar.com/v1/payments/' + encodeURIComponent(paymentId), {
      headers: { Authorization: 'Basic ' + auth }
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    payment = await r.json();
  } catch (e) {
    return res.status(400).json({ error: 'تعذّر التحقق من الدفعة: ' + e.message });
  }

  const paid = payment.status === 'paid' || payment.status === 'captured';
  if (!paid) {
    return res.status(200).json({ paid: false, status: payment.status || 'unknown' });
  }

  const { data: lic } = await supabase
    .from('mken_licenses').select('license_key, plan, expires_at, max_devices')
    .eq('payment_id', paymentId).maybeSingle();

  if (!lic) {
    return res.status(200).json({ paid: true, issued: false, message: 'تم الدفع — جارٍ إصدار الترخيص، حدّث بعد لحظات.' });
  }

  return res.status(200).json({
    paid: true, issued: true,
    licenseKey: lic.license_key, plan: lic.plan,
    expiresAt: lic.expires_at, maxDevices: lic.max_devices
  });
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res, 'GET,POST,OPTIONS')) return;

  const supabase = getSupabase(res);
  if (!supabase) return;

  const action = getAction(req);
  const adminActions = { issue: 1, list: 1, revoke: 1, suspend: 1, resume: 1 };

  try {
    if (adminActions[action] && !isAdmin(req)) {
      return res.status(401).json({ error: 'غير مصرّح — يتطلب رمز الإدارة' });
    }

    switch (action) {
      // عامة
      case 'activate':        return await doActivate(req, res, supabase);
      case 'verify':          return await doVerify(req, res, supabase);
      case 'deactivate':      return await doDeactivate(req, res, supabase);
      case 'checkout-config': return await doCheckoutConfig(req, res);
      case 'checkout-status': return await doCheckoutStatus(req, res, supabase);
      // إدارية
      case 'issue':           return await doIssue(req, res, supabase);
      case 'list':            return await doList(req, res, supabase);
      case 'revoke':          return await doSetStatus(req, res, supabase, 'revoked', 'revoked');
      case 'suspend':         return await doSetStatus(req, res, supabase, 'suspended', 'suspended');
      case 'resume':          return await doSetStatus(req, res, supabase, 'active', 'resumed');
      default:
        return res.status(400).json({ error: 'إجراء غير معروف. استخدم action=activate|verify|deactivate|issue|list|revoke|suspend|resume' });
    }
  } catch (err) {
    console.error('[License API] Error:', err);
    return res.status(500).json({ error: err.message || 'خطأ داخلي' });
  }
};
