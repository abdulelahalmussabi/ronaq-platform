const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let payment = req.body || {};
  const paymentId = payment.id;

  if (!paymentId) {
    return res.status(400).json({ error: 'Missing payment ID in request body' });
  }

  // 1. Secure verification: verify with Moyasar API
  const moyasarSecretKey = process.env.MOYASAR_SECRET_KEY;
  if (!moyasarSecretKey) {
    console.error('CRITICAL ERROR: MOYASAR_SECRET_KEY is not defined in environment variables.');
    return res.status(500).json({ error: 'Server configuration error: payment verification key missing' });
  }

  try {
    console.log(`Verifying payment ${paymentId} with Moyasar API...`);
    const auth = Buffer.from(moyasarSecretKey + ':').toString('base64');
    const response = await fetch(`https://api.moyasar.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': 'Basic ' + auth }
    });
    if (!response.ok) {
      throw new Error(`Moyasar verification failed with HTTP status ${response.status}`);
    }
    payment = await response.json();
  } catch (err) {
    console.error('Moyasar Payment Verification Error:', err.message);
    return res.status(400).json({ error: 'Failed to verify payment with provider API: ' + err.message });
  }

  const { status, amount, metadata, source } = payment;

  // Check if status is paid or captured
  if (status !== 'paid' && status !== 'captured') {
    return res.status(200).json({ status: 'ignored', reason: `Payment status is ${status || 'unknown'}` });
  }

  // 2. Setup Supabase Client
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials in environment variables');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const paymentMethod = source ? (source.company || source.type) : 'online';
  const paymentAmount = amount ? (amount / 100) : 0;
  const { appointment_id, order_id, tenant_slug, type } = metadata || {};
  const slug = tenant_slug || 'default';

  try {
    const resolvedType = type || (appointment_id ? 'booking' : (order_id ? 'order' : 'unknown'));

    if (resolvedType === 'booking') {
      if (!appointment_id) {
        return res.status(400).json({ error: 'Missing appointment_id in payment metadata' });
      }

      console.log(`Processing paid booking: ${appointment_id} for tenant: ${slug}`);

      // Update appointment in Supabase
      const { data, error } = await supabase
        .from('ronaq_appointments')
        .update({
          payment_status: 'paid',
          payment_id: paymentId,
          payment_method: paymentMethod,
          payment_amount: paymentAmount,
          status: 'confirmed',
          updated_at: new Date().toISOString()
        })
        .eq('id', appointment_id)
        .select();

      if (error) throw error;

      if (data && data.length > 0) {
        const apt = data[0];
        // Fetch tenant WhatsApp settings
        const { data: tenant } = await supabase
          .from('ronaq_saas_clients')
          .select('config_data')
          .eq('tenant_slug', slug)
          .maybeSingle();

        const config = tenant ? tenant.config_data : null;
        if (config && config.whatsappApi && config.whatsappApi.enabled && config.whatsappApi.sendConfirmation) {
          await sendServerWhatsApp(apt, 'booking', config);
        }
      }

      return res.status(200).json({ success: true, type: 'booking', id: appointment_id });

    } else if (resolvedType === 'order') {
      if (!order_id) {
        return res.status(400).json({ error: 'Missing order_id in payment metadata' });
      }

      console.log(`Processing paid order: ${order_id} for tenant: ${slug}`);

      // Update order in Supabase
      const { data, error } = await supabase
        .from('ronaq_orders')
        .update({
          payment_status: 'paid',
          payment_id: paymentId,
          payment_method: paymentMethod,
          payment_amount: paymentAmount,
          status: 'confirmed',
          updated_at: new Date().toISOString()
        })
        .eq('id', order_id)
        .select();

      if (error) throw error;

      if (data && data.length > 0) {
        const ord = data[0];
        // Fetch tenant WhatsApp settings
        const { data: tenant } = await supabase
          .from('ronaq_saas_clients')
          .select('config_data')
          .eq('tenant_slug', slug)
          .maybeSingle();

        const config = tenant ? tenant.config_data : null;
        if (config && config.whatsappApi && config.whatsappApi.enabled && config.whatsappApi.sendConfirmation) {
          await sendServerWhatsApp(ord, 'order', config);
        }
      }

      return res.status(200).json({ success: true, type: 'order', id: order_id });

    } else if (resolvedType === 'saas_billing') {
      const { tenant_slug, months } = metadata || {};
      const slug = tenant_slug || 'default';
      const renewMonths = parseInt(months, 10) || 12;

      console.log(`Processing SaaS renewal: ${slug} for ${renewMonths} months`);

      const { data: tenant, error: fetchErr } = await supabase
        .from('ronaq_saas_clients')
        .select('*')
        .eq('tenant_slug', slug)
        .maybeSingle();

      if (fetchErr) throw fetchErr;
      if (!tenant) {
        return res.status(400).json({ error: `Tenant ${slug} not found` });
      }

      let currentEnd = new Date(tenant.subscription_end);
      if (isNaN(currentEnd.getTime()) || currentEnd < new Date()) {
        currentEnd = new Date();
      }
      currentEnd.setMonth(currentEnd.getMonth() + renewMonths);

      const updateFields = {
        subscription_status: 'active',
        subscription_end: currentEnd.toISOString(),
        updated_at: new Date().toISOString()
      };

      if (tenant.saved_config_data) {
        updateFields.config_data = tenant.saved_config_data;
        updateFields.saved_config_data = null;
      }

      // 1. Update subscription status and end date
      const { error: updateErr } = await supabase
        .from('ronaq_saas_clients')
        .update(updateFields)
        .eq('tenant_slug', slug);

      if (updateErr) throw updateErr;

      // 2. Save Invoice record
      const invoiceId = 'inv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
      const { error: invoiceErr } = await supabase
        .from('ronaq_saas_invoices')
        .insert({
          id: invoiceId,
          tenant_slug: slug,
          amount: paymentAmount,
          months: renewMonths,
          status: 'paid',
          payment_id: paymentId,
          payment_method: paymentMethod
        });

      if (invoiceErr) throw invoiceErr;

      // 3. Send WhatsApp confirmation using master credentials
      try {
        const { data: defaultTenant } = await supabase
          .from('ronaq_saas_clients')
          .select('config_data')
          .eq('tenant_slug', 'default')
          .maybeSingle();
        const masterConfig = defaultTenant ? defaultTenant.config_data : {};
        const waConfig = masterConfig.whatsappApi || {};

        if (waConfig.enabled) {
          const phone = cleanPhone(tenant.phone);
          if (phone) {
            const messageText = `تم استلام دفعتك بنجاح لتجديد الاشتراك في منصة مكِّن! 🎉\nتم تجديد اشتراك نشاطك الموقر (${tenant.business_name || slug}) بنجاح لـ ${renewMonths} أشهر.\nتاريخ انتهاء الاشتراك الجديد: ${currentEnd.toLocaleDateString('ar-EG')}.\nشكراً لثقتك بنا!`;
            if (waConfig.provider === 'ultramsg' && waConfig.instanceId) {
              const url = `https://api.ultramsg.com/${waConfig.instanceId}/messages/chat`;
              const params = new URLSearchParams();
              params.append('token', waConfig.token);
              params.append('to', phone);
              params.append('body', messageText);

              await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString()
              });
            } else if (waConfig.provider === 'twilio' && waConfig.accountSid && waConfig.fromNumber) {
              const url = `https://api.twilio.com/2010-04-01/Accounts/${waConfig.accountSid}/Messages.json`;
              const params = new URLSearchParams();
              params.append('Body', messageText);
              params.append('From', 'whatsapp:' + waConfig.fromNumber.replace(/^\+?/, '+'));
              params.append('To', 'whatsapp:+' + phone);

              await fetch(url, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                  'Authorization': 'Basic ' + Buffer.from(waConfig.accountSid + ':' + waConfig.token).toString('base64')
                },
                body: params.toString()
              });
            }
          }
        }
      } catch (err) {
        console.error('Failed to send SaaS billing confirmation WhatsApp:', err.message);
      }

      return res.status(200).json({ success: true, type: 'saas_billing', tenant: slug });

    } else {
      return res.status(200).json({ status: 'ignored', reason: 'Unrecognized metadata type or fields' });
    }
  } catch (err) {
    console.error('Webhook processing failed:', err.message);
    return res.status(500).json({ error: 'Internal Server Error: ' + err.message });
  }
};

// Standalone Helper to send WhatsApp messages from Server side
async function sendServerWhatsApp(item, type, config) {
  const wa = config.whatsappApi || {};
  if (!wa.enabled || !wa.token) return;

  const phone = cleanPhone(item.phone);
  if (!phone) return;

  const brandName = (config.brand && config.brand.name) || 'مكِّن';
  let body = '';

  if (type === 'booking') {
    // Recreate Booking Confirmation message
    const services = config.services || {};
    const serviceOverride = services[item.service_id] || {};
    const serviceTitle = serviceOverride.title || item.service_id;

    const activities = config.activities || {};
    const activityOverride = activities[item.activity_id] || {};
    const activityTitle = activityOverride.title || item.activity_id;

    body = [
      'تم تأكيد موعدك بنجاح — ' + brandName,
      '━━━━━━━━━━━━━━',
      'النشاط: ' + activityTitle,
      'الخدمة: ' + serviceTitle,
      'التاريخ: ' + formatDateArabic(item.date),
      'الوقت: ' + formatTimeArabic(item.time),
      'الاسم: ' + item.customer_name,
      'الجوال: ' + item.phone
    ];
    if (item.district) body.push('الحي/المنطقة: ' + item.district);
    if (item.party_size) body.push('عدد الأشخاص: ' + item.party_size);
    if (item.nights) body.push('عدد الليالي: ' + item.nights);
    if (item.location_address) body.push('العنوان: ' + item.location_address);
    body.push('━━━━━━━━━━━━━━', 'تم سداد الحساب إلكترونياً بنجاح!', 'نتطلع لخدمتك!');
  } else {
    // Recreate Order Confirmation message
    const itemsList = Array.isArray(item.items) ? item.items : JSON.parse(item.items || '[]');
    body = [
      'تم دفع وتأكيد طلب الشراء بنجاح 🎉 — ' + brandName,
      '━━━━━━━━━━━━━━',
      'المنتجات:'
    ];
    itemsList.forEach((line, i) => {
      let row = `${i + 1}. ${line.icon || '🛒'} ${line.serviceTitle} × ${line.quantity}`;
      if (line.priceLabel) row += ` (${line.priceLabel})`;
      body.push(row);
    });
    body.push(
      '━━━━━━━━━━━━━━',
      'الاسم: ' + item.customer_name,
      'الجوال: ' + item.phone
    );
    if (item.district) body.push('الحي: ' + item.district);
    if (item.location_address) body.push('العنوان: ' + item.location_address);
    body.push('━━━━━━━━━━━━━━', 'تم سداد الحساب إلكترونياً بنجاح! رقم العملية: ' + item.payment_id, 'شكراً لتعاملك معنا! سنقوم بالتوصيل قريباً.');
  }

  const messageText = body.join('\n');

  try {
    if (wa.provider === 'ultramsg' && wa.instanceId) {
      const url = `https://api.ultramsg.com/${wa.instanceId}/messages/chat`;
      const params = new URLSearchParams();
      params.append('token', wa.token);
      params.append('to', phone);
      params.append('body', messageText);

      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });
      console.log(`Auto WhatsApp sent via UltraMsg for ${item.id}`);
    } else if (wa.provider === 'twilio' && wa.accountSid && wa.fromNumber) {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${wa.accountSid}/Messages.json`;
      const params = new URLSearchParams();
      params.append('Body', messageText);
      params.append('From', 'whatsapp:' + wa.fromNumber.replace(/^\+?/, '+'));
      params.append('To', 'whatsapp:+' + phone);

      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(wa.accountSid + ':' + wa.token).toString('base64')
        },
        body: params.toString()
      });
      console.log(`Auto WhatsApp sent via Twilio for ${item.id}`);
    } else if (wa.provider === 'custom' && wa.url) {
      const headers = { 'Content-Type': 'application/json' };
      if (wa.token) headers['Authorization'] = 'Bearer ' + wa.token;

      await fetch(wa.url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          to: phone,
          body: messageText,
          event: 'confirmation_webhook',
          item: item
        })
      });
      console.log(`Auto WhatsApp sent via Custom Webhook for ${item.id}`);
    }
  } catch (err) {
    console.error(`Failed to send auto WhatsApp in webhook for ${item.id}:`, err.message);
  }
}

function cleanPhone(phone) {
  let digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.indexOf('966') === 0) return digits;
  if (digits.indexOf('0') === 0) return '966' + digits.slice(1);
  if (digits.length === 9) return '966' + digits;
  return digits;
}

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يونيو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const AR_DAYS = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

function formatDateArabic(dateStr) {
  try {
    const parts = dateStr.split('-');
    const d = new Date(parts[0], parts[1] - 1, parts[2] || 12);
    return AR_DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + AR_MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  } catch (e) {
    return dateStr;
  }
}

function formatTimeArabic(time) {
  try {
    const parts = time.split(':');
    const h = parseInt(parts[0], 10);
    const suffix = h < 12 ? 'صباحاً' : 'مساءً';
    const display = h > 12 ? h - 12 : (h === 0 ? 12 : h);
    return display + ':' + parts[1] + ' ' + suffix;
  } catch (e) {
    return time;
  }
}
