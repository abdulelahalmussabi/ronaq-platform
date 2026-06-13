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
        .from('mken_appointments')
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
          .from('mken_saas_clients')
          .select('config_data')
          .eq('tenant_slug', slug)
          .maybeSingle();

        const config = tenant ? tenant.config_data : null;
        if (config && config.whatsappApi && config.whatsappApi.enabled && config.whatsappApi.sendConfirmation) {
          await sendServerWhatsApp(apt, 'booking', config, supabase, slug);
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
        .from('mken_orders')
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
          .from('mken_saas_clients')
          .select('config_data')
          .eq('tenant_slug', slug)
          .maybeSingle();

        const config = tenant ? tenant.config_data : null;
        if (config && config.whatsappApi && config.whatsappApi.enabled && config.whatsappApi.sendConfirmation) {
          await sendServerWhatsApp(ord, 'order', config, supabase, slug);
        }
      }

      return res.status(200).json({ success: true, type: 'order', id: order_id });

    } else if (resolvedType === 'saas_billing') {
      const { tenant_slug, months } = metadata || {};
      const slug = tenant_slug || 'default';
      const renewMonths = parseInt(months, 10) || 12;

      console.log(`Processing SaaS renewal: ${slug} for ${renewMonths} months`);

      const { data: tenant, error: fetchErr } = await supabase
        .from('mken_saas_clients')
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
        .from('mken_saas_clients')
        .update(updateFields)
        .eq('tenant_slug', slug);

      if (updateErr) throw updateErr;

      // 2. Save Invoice record
      const invoiceId = 'inv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
      const { error: invoiceErr } = await supabase
        .from('mken_saas_invoices')
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
          .from('mken_saas_clients')
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
async function logWhatsappMessageServer(supabase, logObj, tenantSlug) {
  if (!supabase) return;
  try {
    await supabase.from('mken_whatsapp_logs').insert({
      tenant_slug: tenantSlug,
      phone: logObj.phone,
      body: logObj.body,
      provider: logObj.provider,
      status: logObj.status,
      error_message: logObj.errorMessage || null,
      event_type: logObj.eventType || null,
      appointment_id: logObj.appointmentId || null,
      retry_count: logObj.retryCount || 0
    });
  } catch (err) {
    console.error('Failed to log WhatsApp message on server:', err.message);
  }
}

function parseTemplate(templateText, data) {
  if (!templateText) return '';
  return templateText
    .replace(/{brandName}/g, data.brandName || '')
    .replace(/{customerName}/g, data.customerName || '')
    .replace(/{phone}/g, data.phone || '')
    .replace(/{serviceTitle}/g, data.serviceTitle || '')
    .replace(/{activityTitle}/g, data.activityTitle || '')
    .replace(/{date}/g, data.date || '')
    .replace(/{time}/g, data.time || '')
    .replace(/{appointmentId}/g, data.appointmentId || '')
    .replace(/{orderId}/g, data.orderId || '')
    .replace(/{orderItems}/g, data.orderItems || '')
    .replace(/{hoursBefore}/g, data.hoursBefore || '')
    .replace(/{reminderLeadText}/g, data.reminderLeadText || '');
}

async function sendRawServerWhatsApp(phone, messageText, imageUrl, wa, supabase, tenantSlug = 'default', useMetaTemplateComponents = false, rawTemplateText = '') {
  const provider = wa.provider;
  let promise;

  if (provider === 'ultramsg' && wa.instanceId) {
    const useImage = !!imageUrl;
    const url = `https://api.ultramsg.com/${wa.instanceId}/messages/${useImage ? 'image' : 'chat'}`;
    const params = new URLSearchParams();
    params.append('token', wa.token);
    params.append('to', phone);
    if (useImage) {
      params.append('image', imageUrl);
      params.append('caption', messageText);
    } else {
      params.append('body', messageText);
    }

    promise = fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    }).then(r => r.ok ? r.json() : Promise.reject(new Error(`UltraMsg status ${r.status}`)));
  } else if (provider === 'twilio' && wa.accountSid && wa.fromNumber) {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${wa.accountSid}/Messages.json`;
    const params = new URLSearchParams();
    params.append('Body', messageText);
    params.append('From', 'whatsapp:' + wa.fromNumber.replace(/^\+?/, '+'));
    params.append('To', 'whatsapp:+' + phone);
    if (imageUrl) {
      params.append('MediaUrl', imageUrl);
    }

    promise = fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(wa.accountSid + ':' + wa.token).toString('base64')
      },
      body: params.toString()
    }).then(r => r.ok ? r.json() : Promise.reject(new Error(`Twilio status ${r.status}`)));
  } else if (provider === 'custom' && wa.url) {
    const headers = { 'Content-Type': 'application/json' };
    if (wa.token) headers['Authorization'] = 'Bearer ' + wa.token;

    const payload = {
      to: phone,
      body: messageText,
      event: 'server_notification'
    };
    if (imageUrl) payload.imageUrl = imageUrl;

    promise = fetch(wa.url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    }).then(r => r.ok ? r.text() : Promise.reject(new Error(`Custom Webhook status ${r.status}`)));
  } else if (provider === 'whatsapp_business' && wa.phoneNumberId) {
    const url = `https://graph.facebook.com/v18.0/${wa.phoneNumberId}/messages`;
    const headers = {
      'Authorization': 'Bearer ' + wa.token,
      'Content-Type': 'application/json'
    };

    let payload;
    if (imageUrl) {
      payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "image",
        image: {
          link: imageUrl,
          caption: messageText
        }
      };
    } else if (wa.templateName) {
      let parameters = [];
      if (useMetaTemplateComponents && rawTemplateText) {
        const paramVals = extractTemplateParameters(rawTemplateText, messageText);
        parameters = paramVals.map(val => ({
          type: "text",
          text: val
        }));
      } else {
        parameters = [
          {
            type: "text",
            text: messageText
          }
        ];
      }

      payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "template",
        template: {
          name: wa.templateName,
          language: {
            code: wa.languageCode || "ar"
          },
          components: [
            {
              type: "body",
              parameters: parameters
            }
          ]
        }
      };
    } else {
      payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "text",
        text: {
          body: messageText
        }
      };
    }

    promise = fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    }).then(async r => {
      if (r.ok) return r.json();
      let errorMsg = `WhatsApp Business status ${r.status}`;
      try {
        const errData = await r.json();
        if (errData && errData.error && errData.error.message) {
          errorMsg = errData.error.message;
        }
      } catch (e) {}
      throw new Error(errorMsg);
    });
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const result = await promise;
  await logWhatsappMessageServer(supabase, {
    phone,
    body: messageText,

    provider,
    status: 'success',
    eventType: 'server_notification'
  }, tenantSlug);
  return result;
}

async function sendServerWhatsApp(item, type, config, supabase, tenantSlug = 'default') {
  const wa = config.whatsappApi || {};
  if (!wa.enabled) return;

  const phone = cleanPhone(item.phone);
  if (!phone) return;

  const brandName = (config.brand && config.brand.name) || 'مكِّن';
  let messageText = '';
  let imageUrl = null;

  if (type === 'booking') {
    const services = config.services || {};
    const serviceOverride = services[item.service_id] || {};
    const serviceTitle = serviceOverride.title || item.service_id;

    const activities = config.activities || {};
    const activityOverride = activities[item.activity_id] || {};
    const activityTitle = activityOverride.title || item.activity_id;

    const customTemplate = wa.templates && wa.templates.confirmation;
    if (customTemplate) {
      messageText = parseTemplate(customTemplate, {
        brandName,
        customerName: item.customer_name,
        phone: item.phone,
        serviceTitle,
        activityTitle,
        date: formatDateArabic(item.date),
        time: formatTimeArabic(item.time),
        appointmentId: item.id
      });
    } else {
      const body = [
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
      messageText = body.join('\n');
    }

    if (wa.sendQrCode) {
      imageUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent('BOOKING-' + item.id);
    }
  } else {
    const itemsList = Array.isArray(item.items) ? item.items : JSON.parse(item.items || '[]');
    let orderItemsText = '';
    itemsList.forEach((line, i) => {
      let row = `${i + 1}. ${line.icon || '🛒'} ${line.serviceTitle} × ${line.quantity}`;
      if (line.priceLabel) row += ` (${line.priceLabel})`;
      orderItemsText += (orderItemsText ? '\n' : '') + row;
    });

    const customTemplate = wa.templates && wa.templates.order_confirmation;
    if (customTemplate) {
      messageText = parseTemplate(customTemplate, {
        brandName,
        customerName: item.customer_name,
        phone: item.phone,
        orderId: item.id,
        orderItems: orderItemsText
      });
    } else {
      const body = [
        'تم دفع وتأكيد طلب الشراء بنجاح 🎉 — ' + brandName,
        '━━━━━━━━━━━━━━',
        'المنتجات:',
        orderItemsText,
        '━━━━━━━━━━━━━━',
        'الاسم: ' + item.customer_name,
        'الجوال: ' + item.phone
      ];
      if (item.district) body.push('الحي: ' + item.district);
      if (item.location_address) body.push('العنوان: ' + item.location_address);
      body.push('━━━━━━━━━━━━━━', 'تم سداد الحساب إلكترونياً بنجاح! رقم العملية: ' + item.payment_id, 'شكراً لتعاملك معنا! سنقوم بالتوصيل قريباً.');
      messageText = body.join('\n');
    }

    if (wa.sendQrCode) {
      imageUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent('ORDER-' + item.id);
    }
  }

  try {
    const rawTemplateText = type === 'booking'
      ? (wa.templates && wa.templates.confirmation) || ''
      : (wa.templates && wa.templates.order_confirmation) || '';
    await sendRawServerWhatsApp(phone, messageText, imageUrl, wa, supabase, tenantSlug, wa.useMetaTemplateComponents, rawTemplateText);
    console.log(`Auto WhatsApp sent via ${wa.provider} for ${item.id}`);
  } catch (err) {
    console.error(`Failed to send auto WhatsApp in webhook for ${item.id}:`, err.message);
  }

  if (wa.sendOwnerAlert) {
    try {
      const ownerPhone = cleanPhone(wa.ownerAlertPhone || (config.brand && config.brand.phone) || config.phone);
      if (ownerPhone) {
        let alertText = '';
        if (type === 'booking') {
          const services = config.services || {};
          const serviceOverride = services[item.service_id] || {};
          const serviceTitle = serviceOverride.title || item.service_id;
          alertText = [
            '🔔 حجز جديد — ' + brandName,
            '━━━━━━━━━━━━━━',
            'تم تسجيل حجز موعد جديد ومؤكد:',
            'العميل: ' + item.customer_name,
            'الجوال: ' + item.phone,
            'الخدمة: ' + serviceTitle,
            'التاريخ: ' + formatDateArabic(item.date),
            'الوقت: ' + formatTimeArabic(item.time),
            '━━━━━━━━━━━━━━',
            'يرجى مراجعة لوحة الإدارة.'
          ].join('\n');
        } else {
          alertText = [
            '🔔 طلب شراء جديد — ' + brandName,
            '━━━━━━━━━━━━━━',
            'تم تقديم طلب شراء جديد ومؤكد:',
            'العميل: ' + item.customer_name,
            'الجوال: ' + item.phone,
            'القيمة: ' + (item.payment_amount || ''),
            '━━━━━━━━━━━━━━',
            'يرجى مراجعة لوحة الإدارة.'
          ].join('\n');
        }
        await sendRawServerWhatsApp(ownerPhone, alertText, null, wa, supabase, tenantSlug);
      }
    } catch (e) {
      console.error('Failed to send server-side owner alert:', e.message);
    }
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

function mapDbItemToAppointment(item, type) {
  if (!item) return null;
  if (type === 'booking') {
    return {
      id: item.id,
      activityId: item.activity_id || '',
      serviceId: item.service_id || '',
      date: item.date || '',
      time: item.time || '',
      customerName: item.customer_name || '',
      phone: item.phone || '',
      district: item.district || '',
      locationAddress: item.location_address || '',
      notes: item.notes || '',
      partySize: item.party_size != null ? item.party_size : null,
      nights: item.nights != null ? item.nights : null,
      status: item.status || 'confirmed',
      paymentStatus: item.payment_status || 'paid',
      paymentId: item.payment_id || null,
    };
  }
  return {
    id: item.id,
    activityId: item.activity_id || '',
    customerName: item.customer_name || '',
    phone: item.phone || '',
    district: item.district || '',
    locationAddress: item.location_address || '',
    status: item.status || 'confirmed',
    paymentStatus: item.payment_status || 'paid',
    paymentId: item.payment_id || null,
    items: Array.isArray(item.items) ? item.items : [],
  };
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

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractTemplateParameters(templateText, bodyText) {
  if (!templateText) return [bodyText];

  const placeholders = [];
  const regex = /\{[a-zA-Z0-9_]+\}/g;
  let match;
  while ((match = regex.exec(templateText)) !== null) {
    placeholders.push(match[0]);
  }

  if (placeholders.length === 0) {
    return [bodyText];
  }

  let temp = templateText;
  placeholders.forEach(ph => {
    temp = temp.replace(ph, '__CAP_VAR__');
  });

  const escaped = escapeRegExp(temp);
  const patternStr = '^' + escaped.replace(/__CAP_VAR__/g, '([\\s\\S]*?)') + '$';

  try {
    const pattern = new RegExp(patternStr);
    const bodyMatch = bodyText.match(pattern);
    if (bodyMatch) {
      const params = [];
      for (let i = 1; i < bodyMatch.length; i++) {
        params.push(bodyMatch[i].trim());
      }
      return params;
    }
  } catch (e) {
    console.warn('Failed to parse template regex matcher', e);
  }

  return [bodyText];
}

