const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async function handler(req, res) {
  // 1. Meta / Facebook Webhook GET Verification
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // We can verify with a static token or return challenge
    if (mode === 'subscribe') {
      console.log('Webhook verified successfully!');
      return res.status(200).send(challenge);
    }
    return res.status(400).send('Invalid GET verification request');
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tenantSlug = req.query.tenant || req.query.slug || 'default';

  try {
    let phone = '';
    let bodyText = '';
    let provider = 'unknown';

    // Parse incoming webhook based on payload signature
    // A. Twilio (x-www-form-urlencoded)
    if (req.body.From && req.body.Body) {
      phone = req.body.From.replace('whatsapp:', '').replace('+', '').trim();
      bodyText = req.body.Body.trim();
      provider = 'twilio';
    }
    // B. UltraMsg (JSON)
    else if (req.body.data && req.body.data.from && req.body.data.body) {
      phone = req.body.data.from.split('@')[0].replace('+', '').trim();
      bodyText = req.body.data.body.trim();
      provider = 'ultramsg';
    }
    // C. WhatsApp Cloud API (JSON)
    else if (req.body.object === 'whatsapp_business_account' && req.body.entry) {
      provider = 'whatsapp_business';
      try {
        const changes = req.body.entry[0].changes[0].value;
        if (changes.messages && changes.messages[0]) {
          const message = changes.messages[0];
          phone = message.from.replace('+', '').trim();
          if (message.type === 'text') {
            bodyText = message.text.body.trim();
          } else {
            bodyText = '[غير مقروء - ميديا/مستند/تفاعل]';
          }
        }
      } catch (e) {
        console.error('Failed to parse WhatsApp Business Cloud API webhook:', e);
      }
    }

    if (!phone || !bodyText) {
      // Silent success return for message status updates/delivery reports
      return res.status(200).json({ status: 'ignored', message: 'No message contents found' });
    }

    const cleanPhoneStr = cleanPhone(phone);
    if (!cleanPhoneStr) {
      return res.status(200).json({ status: 'ignored', message: 'Invalid phone number format' });
    }

    // 2. Log Inbound Message to CRM Log History
    await supabase.from('mken_whatsapp_logs').insert({
      tenant_slug: tenantSlug,
      phone: cleanPhoneStr,
      body: bodyText,
      provider: provider,
      status: 'received',
      event_type: 'inbound',
      created_at: new Date().toISOString()
    });

    // 3. Fetch Tenant Configuration
    const { data: clientRow } = await supabase
      .from('mken_saas_clients')
      .select('config_data')
      .eq('tenant_slug', tenantSlug)
      .maybeSingle();

    if (!clientRow || !clientRow.config_data) {
      return res.status(200).json({ status: 'ignored', message: 'Tenant config not found' });
    }

    const config = clientRow.config_data;
    const wa = config.whatsappApi || {};

    if (!wa.enabled || wa.provider === 'none') {
      return res.status(200).json({ status: 'ignored', message: 'WhatsApp API not enabled for tenant' });
    }

    // 4. Chatbot Command Parsing
    const cleanedMsg = bodyText.toLowerCase().trim();
    let replyText = '';

    if (cleanedMsg.includes('موعد') || cleanedMsg.includes('حجز') || cleanedMsg.includes('أين') || cleanedMsg.includes('اين')) {
      if (cleanedMsg.includes('إلغاء') || cleanedMsg.includes('الغاء') || cleanedMsg.includes('ألغ') || cleanedMsg.includes('الغ')) {
        // Cancel Appointment Command
        const { data: apts } = await supabase
          .from('mken_appointments')
          .select('*')
          .eq('tenant_slug', tenantSlug)
          .eq('phone', cleanPhoneStr)
          .in('status', ['confirmed', 'pending'])
          .order('date', { ascending: false })
          .order('time', { ascending: false })
          .limit(1);

        if (apts && apts.length > 0) {
          const apt = apts[0];
          await supabase
            .from('mken_appointments')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('id', apt.id);
          
          replyText = `تم إلغاء موعدك القادم بنجاح.\nالخدمة: ${apt.service_id}\nالتاريخ: ${formatDateArabic(apt.date)} - الوقت: ${formatTimeArabic(apt.time)}\n\nنشكرك لتفهمك!`;
        } else {
          replyText = 'عذراً، لم نجد أي موعد نشط ومسجل برقم جوالك حالياً لإلغائه.';
        }
      } else {
        // Query Next Active Appointments Command
        const { data: apts } = await supabase
          .from('mken_appointments')
          .select('*')
          .eq('tenant_slug', tenantSlug)
          .eq('phone', cleanPhoneStr)
          .in('status', ['confirmed', 'pending'])
          .order('date', { ascending: true })
          .order('time', { ascending: true })
          .limit(2);

        if (apts && apts.length > 0) {
          replyText = 'مواعيدك القادمة المسجلة لدينا:\n━━━━━━━━━━━━━━\n';
          apts.forEach((apt, i) => {
            replyText += `${i + 1}. الخدمة: ${apt.service_id}\nالتاريخ: ${formatDateArabic(apt.date)}\nالوقت: ${formatTimeArabic(apt.time)}\nالحالة: ${apt.status === 'confirmed' ? 'مؤكد' : 'قيد الانتظار'}\n━━━━━━━━━━━━━━\n`;
          });
          replyText += '\nلإلغاء آخر موعد، أرسل: "إلغاء موعدي".';
        } else {
          replyText = 'لا توجد مواعيد قادمة نشطة مسجلة برقم جوالك حالياً.';
        }
      }
    } else {
      // Default Welcome/Fallback Message
      const brandName = (config.brand && config.brand.name) || 'مكِّن';
      replyText = `مرحباً بك في (${brandName})! 🤖\n\n- لمعرفة تفاصيل مواعيدك القادمة، أرسل: "أين موعدي"\n- لإلغاء موعدك الأخير، أرسل: "إلغاء موعدي"`;
    }

    // 5. Send Chatbot Response
    if (replyText) {
      await sendServerWhatsAppReply(cleanPhoneStr, replyText, wa, supabase, tenantSlug);
    }

    return res.status(200).json({ status: 'success', message: 'Inbound message processed' });
  } catch (err) {
    console.error('Error handling whatsapp webhook:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
};

async function sendServerWhatsAppReply(phone, messageText, wa, supabase, tenantSlug) {
  const provider = wa.provider;
  let promise;

  if (provider === 'ultramsg' && wa.instanceId) {
    const url = `https://api.ultramsg.com/${wa.instanceId}/messages/chat`;
    const params = new URLSearchParams();
    params.append('token', wa.token);
    params.append('to', phone);
    params.append('body', messageText);

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

    promise = fetch(wa.url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        to: phone,
        body: messageText,
        event: 'chatbot_reply'
      })
    }).then(r => r.ok ? r.text() : Promise.reject(new Error(`Custom Webhook status ${r.status}`)));
  } else if (provider === 'whatsapp_business' && wa.phoneNumberId) {
    const url = `https://graph.facebook.com/v18.0/${wa.phoneNumberId}/messages`;
    const headers = {
      'Authorization': 'Bearer ' + wa.token,
      'Content-Type': 'application/json'
    };

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phone,
      type: "text",
      text: {
        body: messageText
      }
    };

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
    return;
  }

  try {
    await promise;
    await supabase.from('mken_whatsapp_logs').insert({
      tenant_slug: tenantSlug,
      phone: phone,
      body: messageText,
      provider: provider,
      status: 'success',
      event_type: 'chatbot_reply',
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('Failed to send chatbot reply:', err.message);
    await supabase.from('mken_whatsapp_logs').insert({
      tenant_slug: tenantSlug,
      phone: phone,
      body: messageText,
      provider: provider,
      status: 'failed',
      error_message: err.message,
      event_type: 'chatbot_reply',
      created_at: new Date().toISOString()
    });
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

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const AR_DAYS = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

function parseDateISO(str) {
  return new Date(str + 'T12:00:00');
}

function formatDateArabic(dateStr) {
  try {
    const d = parseDateISO(dateStr);
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
