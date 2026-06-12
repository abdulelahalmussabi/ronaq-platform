const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  // Optional security: verify authorization header
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('--- Serverless Cron Job Triggered ---');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase credentials missing' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const logMessages = [];
  const log = (msg) => {
    console.log(msg);
    logMessages.push(msg);
  };

  try {
    // 1. Get default config for master credentials
    let { data: defaultTenant, error: configError } = await supabase
      .from('ronaq_saas_clients')
      .select('config_data')
      .eq('tenant_slug', 'default')
      .maybeSingle();

    let masterConfig = defaultTenant ? defaultTenant.config_data : {};

    // 2. Check tenant subscriptions
    log('Checking SAAS Tenant Subscriptions...');
    const { data: tenants, error: tenantsError } = await supabase
      .from('ronaq_saas_clients')
      .select('*');

    if (tenantsError) throw tenantsError;

    const now = new Date();

    for (const tenant of tenants) {
      if (tenant.tenant_slug === 'default') continue;

      const endDate = new Date(tenant.subscription_end);
      const timeDiff = endDate.getTime() - now.getTime();
      const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
      const sentReminders = Array.isArray(tenant.reminders_sent) ? tenant.reminders_sent : [];

      if (timeDiff <= 0 && tenant.subscription_status === 'active') {
        log(`Tenant ${tenant.tenant_slug} subscription expired. Resetting profile to default.`);
        
        const savedConfig = tenant.config_data || {};
        const expiredConfig = {
          brand: {
            name: tenant.business_name || 'مكِّن للخدمات',
            tagline: 'عذراً، هذا الحساب منتهي الصلاحية حالياً. يرجى تجديد الاشتراك للوصول إلى الخدمات.',
            logo: ''
          },
          enabledActivities: ['tech-digital'],
          enabled: ['web-design'],
          phone: tenant.phone,
          subscription: {
            status: 'expired',
            start: tenant.subscription_start,
            end: tenant.subscription_end,
            businessName: tenant.business_name,
            email: tenant.email,
            phone: tenant.phone,
            tenantSlug: tenant.tenant_slug
          }
        };

        const { error: updateError } = await supabase
          .from('ronaq_saas_clients')
          .update({
            subscription_status: 'expired',
            config_data: expiredConfig,
            saved_config_data: savedConfig,
            updated_at: new Date().toISOString()
          })
          .eq('id', tenant.id);

        if (updateError) {
          log(`Failed to expire tenant ${tenant.tenant_slug}: ${updateError.message}`);
        } else {
          const expiryMsg = `عذراً شريكنا في منصة مكِّن ⚠️\nانتهى اشتراك نشاطك الموقر (${tenant.business_name}) اليوم.\nتم حفظ كافة بياناتك وإعداداتك بشكل آمن، ولكن تم إرجاع الصفحة العامة للوضع الافتراضي لحين التجديد.\nيرجى الدخول للوحة الإدارة لتجديد الاشتراك واستعادة موقعك فوراً.`;
          try {
            await sendWhatsAppMessage(tenant.phone, expiryMsg, 'subscription_expired', null, masterConfig);
            log(`Expiration alert sent to ${tenant.tenant_slug} (${tenant.phone})`);
          } catch (e) {
            log(`Failed to send expiration message to tenant ${tenant.tenant_slug}: ${e.message}`);
          }
        }
        continue;
      }

      if (tenant.subscription_status === 'active') {
        let reminderDays = null;
        if (daysDiff <= 14 && daysDiff > 0 && !sentReminders.includes(14)) {
          reminderDays = 14;
        } else if (daysDiff <= 30 && daysDiff > 14 && !sentReminders.includes(30)) {
          reminderDays = 30;
        }

        if (reminderDays !== null) {
          log(`Sending subscription reminder (${reminderDays} days) to tenant ${tenant.tenant_slug}`);
          let textTime = reminderDays === 30 ? 'شهر واحد (30 يوماً)' : 'أسبوعين (14 يوماً)';
          const reminderMsg = `تنبيه تجديد الاشتراك — منصة مكِّن 🔔\nشريكنا العزيز في (${tenant.business_name})، نود تذكيرك بأن اشتراكك سينتهي بعد ${textTime} بتاريخ ${endDate.toLocaleDateString('ar-EG')}.\nيرجى تجديد الاشتراك مبكراً لضمان استمرار عمل موقعك وتلقي حجوزات عملائك دون انقطاع. 🚀`;

          try {
            await sendWhatsAppMessage(tenant.phone, reminderMsg, 'subscription_reminder', null, masterConfig);
            sentReminders.push(reminderDays);
            
            await supabase
              .from('ronaq_saas_clients')
              .update({
                reminders_sent: sentReminders,
                updated_at: new Date().toISOString()
              })
              .eq('id', tenant.id);

            log(`Successfully sent and recorded ${reminderDays} days reminder for ${tenant.tenant_slug}`);
          } catch (e) {
            log(`Failed to send reminder to tenant ${tenant.tenant_slug}: ${e.message}`);
          }
        }
      }
    }

    // 3. Check active appointments and send due reminders
    log('Checking active appointments...');
    const { data: appointments, error: aptError } = await supabase
      .from('ronaq_appointments')
      .select('*')
      .eq('status', 'confirmed');

    if (aptError) throw aptError;

    log(`Checking ${appointments.length} confirmed appointments...`);
    const tenantConfigs = new Map();

    for (const apt of appointments) {
      const aptTime = new Date(`${apt.date}T${apt.time || '00:00'}:00`);
      if (aptTime <= now) continue;

      const sent = Array.isArray(apt.reminders_sent) ? apt.reminders_sent : [];
      const tenantSlug = apt.tenant_slug || 'default';

      let tenantConfig = tenantConfigs.get(tenantSlug);
      if (!tenantConfig) {
        const { data: row } = await supabase
          .from('ronaq_saas_clients')
          .select('config_data')
          .eq('tenant_slug', tenantSlug)
          .maybeSingle();
        
        tenantConfig = row ? row.config_data : masterConfig;
        tenantConfigs.set(tenantSlug, tenantConfig);
      }

      const wa = tenantConfig.whatsappApi || masterConfig.whatsappApi || {};
      if (!wa.enabled || wa.provider === 'none' || !wa.sendReminder) continue;

      const reminders = wa.reminders || (tenantConfig.booking && tenantConfig.booking.reminders) || {};
      if (reminders.enabled === false) continue;

      let hoursBefore = Array.isArray(reminders.hoursBefore) ? reminders.hoursBefore : [24, 2];
      hoursBefore = hoursBefore.map(h => parseInt(h, 10)).filter(h => h > 0);
      const windowMinutes = parseInt(reminders.windowMinutes, 10) || 60;

      for (const hours of hoursBefore) {
        if (sent.includes(hours)) continue;

        const remindAt = new Date(aptTime.getTime() - hours * 60 * 60 * 1000);
        const windowEnd = new Date(remindAt.getTime() + windowMinutes * 60 * 1000);

        if (now >= remindAt && now < aptTime) {
          const services = tenantConfig.services || {};
          const serviceOverride = services[apt.service_id] || {};
          const serviceTitle = serviceOverride.title || apt.service_id;
          
          const activities = tenantConfig.activities || {};
          const activityOverride = activities[apt.activity_id] || {};
          const activityTitle = activityOverride.title || apt.activity_id;
          
          const brandName = (tenantConfig.brand && tenantConfig.brand.name) || 'المنشأة الموقرة';
          const body = buildReminderMessage(brandName, {
            customerName: apt.customer_name,
            phone: apt.phone,
            date: apt.date,
            time: apt.time,
            partySize: apt.party_size,
            nights: apt.nights,
            locationAddress: apt.location_address
          }, serviceTitle, activityTitle, hours);

          log(`Sending reminder ${hours}h for appointment ${apt.id} to ${apt.phone}...`);

          try {
            await sendWhatsAppMessage(apt.phone, body, 'reminder', apt, tenantConfig);

            sent.push(hours);
            await supabase
              .from('ronaq_appointments')
              .update({ reminders_sent: sent, updated_at: new Date().toISOString() })
              .eq('id', apt.id);

            log(`Successfully sent and recorded reminder for ${apt.id}`);
          } catch (err) {
            log(`Failed to send reminder for appointment ${apt.id}: ${err.message}`);
          }
        }
      }
    }

    log('Cron job execution finished successfully.');
    return res.status(200).json({ success: true, logs: logMessages });

  } catch (err) {
    log(`Cron Job Failed: ${err.message}`);
    return res.status(500).json({ error: err.message, logs: logMessages });
  }
};

// Standalone Helper functions
async function sendWhatsAppMessage(to, body, eventType, appointment, config) {
  const waConfig = config.whatsappApi || {};
  if (!waConfig.enabled) throw new Error('WhatsApp API is disabled');

  const phone = cleanPhone(to);
  if (!phone) throw new Error('Invalid phone number: ' + to);

  switch (waConfig.provider) {
    case 'ultramsg':
      return sendUltramsg(phone, body, waConfig.instanceId, waConfig.token);
    case 'twilio':
      return sendTwilio(phone, body, waConfig.accountSid, waConfig.token, waConfig.fromNumber);
    case 'custom':
      return sendCustom(phone, body, waConfig.url, waConfig.token, eventType, appointment);
    default:
      throw new Error('Unsupported provider: ' + waConfig.provider);
  }
}

async function sendUltramsg(phone, body, instanceId, token) {
  const url = `https://api.ultramsg.com/${instanceId}/messages/chat`;
  const params = new URLSearchParams();
  params.append('token', token);
  params.append('to', phone);
  params.append('body', body);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  if (!res.ok) throw new Error('Ultramsg request failed, status ' + res.status);
  return res.json();
}

async function sendTwilio(phone, body, accountSid, token, fromNumber) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const formattedTo = '+' + phone;
  const params = new URLSearchParams();
  params.append('Body', body);
  params.append('From', 'whatsapp:' + fromNumber.replace(/^\+?/, '+'));
  params.append('To', 'whatsapp:' + formattedTo);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(accountSid + ':' + token).toString('base64')
    },
    body: params.toString()
  });
  if (!res.ok) throw new Error('Twilio request failed, status ' + res.status);
  return res.json();
}

async function sendCustom(phone, body, webhookUrl, token, eventType, appointment) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      to: phone,
      body: body,
      event: eventType,
      appointment: appointment
    })
  });
  if (!res.ok) throw new Error('Custom Webhook failed, status ' + res.status);
  return res.text();
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
  const d = parseDateISO(dateStr);
  return AR_DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + AR_MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}

function formatTimeArabic(time) {
  const parts = time.split(':');
  const h = parseInt(parts[0], 10);
  const suffix = h < 12 ? 'صباحاً' : 'مساءً';
  const display = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  return display + ':' + parts[1] + ' ' + suffix;
}

function reminderLeadText(hoursBefore) {
  if (hoursBefore >= 24 && hoursBefore % 24 === 0) {
    const days = hoursBefore / 24;
    return days === 1 ? 'غداً' : 'خلال ' + days + ' أيام';
  }
  if (hoursBefore === 1) return 'خلال ساعة';
  return 'خلال ' + hoursBefore + ' ساعات';
}

function buildReminderMessage(brandName, appointment, serviceTitle, activityTitle, hoursBefore) {
  const lines = [
    'تذكير بموعدك — ' + brandName,
    '━━━━━━━━━━━━━━',
    'مرحباً ' + appointment.customerName + '،',
    'نذكّرك بموعدك ' + reminderLeadText(hoursBefore) + ':',
  ];
  if (activityTitle) lines.push('النشاط: ' + activityTitle);
  lines.push(
    'الخدمة: ' + serviceTitle,
    'التاريخ: ' + formatDateArabic(appointment.date),
    'الوقت: ' + formatTimeArabic(appointment.time)
  );
  if (appointment.partySize) lines.push('عدد الضيوف: ' + appointment.partySize);
  if (appointment.nights) lines.push('عدد الليالي: ' + appointment.nights);
  if (appointment.locationAddress) lines.push('العنوان: ' + appointment.locationAddress);
  lines.push('━━━━━━━━━━━━━━', 'نتطلع لرؤيتك!', 'للاستفسار رد على هذه الرسالة.');
  return lines.join('\n');
}
