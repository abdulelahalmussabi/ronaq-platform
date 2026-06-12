/**
 * سكربت أتمتة إرسال تذكيرات واتساب تلقائياً من الخادم (Scheduler)
 *
 * 1) تثبيت المكتبات:
 *    npm install @supabase/supabase-js
 * 2) تشغيل السكربت عبر Cron Job كل ساعة أو كل 5 دقائق:
 *    node scripts/whatsapp-scheduler.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const configPath = path.resolve('data/config.json');
let localConfig = {};
try {
  if (fs.existsSync(configPath)) {
    localConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (e) {
  console.error('Error reading data/config.json:', e.message);
}

const supabaseUrl = process.env.SUPABASE_URL || (localConfig.supabase && localConfig.supabase.url);
const supabaseKey = process.env.SUPABASE_KEY || (localConfig.supabase && localConfig.supabase.key);

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Supabase URL and Key must be provided in environment variables or data/config.json');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ARABIC TRANSLATION HELPERS (duplicated from frontend for standalone execution)
const AR_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];
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

function cleanPhone(phone) {
  let digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.indexOf('966') === 0) return digits;
  if (digits.indexOf('0') === 0) return '966' + digits.slice(1);
  if (digits.length === 9) return '966' + digits;
  return digits;
}

// WhatsApp Senders
async function sendWhatsAppMessage(to, body, eventType, appointment, config) {
  const waConfig = config.whatsappApi || {};
  if (!waConfig.enabled) throw new Error('WhatsApp API is disabled in settings');

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

async function checkTenantSubscriptions(supabase, masterConfig) {
  console.log('--- Checking SAAS Tenant Subscriptions ---');
  
  const { data: tenants, error: tenantsError } = await supabase
    .from('ronaq_saas_clients')
    .select('*');

  if (tenantsError) {
    console.error('Error fetching tenants:', tenantsError.message);
    return;
  }

  const now = new Date();
  
  for (const tenant of tenants) {
    if (tenant.tenant_slug === 'default') continue;

    const endDate = new Date(tenant.subscription_end);
    const timeDiff = endDate.getTime() - now.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
    
    const sentReminders = Array.isArray(tenant.reminders_sent) ? tenant.reminders_sent : [];
    
    // Check if subscription has expired
    if (timeDiff <= 0 && tenant.subscription_status === 'active') {
      console.log(`Tenant ${tenant.tenant_slug} subscription expired. Resetting profile to default.`);
      
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
        console.error(`Failed to expire tenant ${tenant.tenant_slug}:`, updateError.message);
      } else {
        const expiryMsg = `عذراً شريكنا في منصة مكِّن ⚠️\nانتهى اشتراك نشاطك الموقر (${tenant.business_name}) اليوم.\nتم حفظ كافة بياناتك وإعداداتك بشكل آمن، ولكن تم إرجاع الصفحة العامة للوضع الافتراضي لحين التجديد.\nيرجى الدخول للوحة الإدارة لتجديد الاشتراك واستعادة موقعك فوراً.`;
        try {
          await sendWhatsAppMessage(tenant.phone, expiryMsg, 'subscription_expired', null, masterConfig);
          console.log(`Expiration alert sent to ${tenant.tenant_slug} (${tenant.phone})`);
        } catch (e) {
          console.error(`Failed to send expiration message to tenant ${tenant.tenant_slug}:`, e.message);
        }
      }
      continue;
    }

    // Check for subscription reminders (30 days and 14 days)
    if (tenant.subscription_status === 'active') {
      let reminderDays = null;
      
      if (daysDiff <= 14 && daysDiff > 0 && !sentReminders.includes(14)) {
        reminderDays = 14;
      } else if (daysDiff <= 30 && daysDiff > 14 && !sentReminders.includes(30)) {
        reminderDays = 30;
      }

      if (reminderDays !== null) {
        console.log(`Sending subscription reminder (${reminderDays} days) to tenant ${tenant.tenant_slug}`);
        
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

          console.log(`Successfully sent and recorded ${reminderDays} days reminder for ${tenant.tenant_slug}`);
        } catch (e) {
          console.error(`Failed to send reminder to tenant ${tenant.tenant_slug}:`, e.message);
        }
      }
    }
  }
  console.log('--- Done checking SAAS Subscriptions ---');
}

async function run() {
  console.log('--- Checking for due WhatsApp reminders ---', new Date().toISOString());

  // 1. Get master config from Supabase
  let { data: defaultTenant, error: configError } = await supabase
    .from('ronaq_saas_clients')
    .select('config_data')
    .eq('tenant_slug', 'default')
    .maybeSingle();

  let config = {};
  if (configError || !defaultTenant) {
    // Try fallback to old table
    const { data: oldConfig, error: oldConfigError } = await supabase
      .from('ronaq_config')
      .select('config_data')
      .eq('id', 1)
      .maybeSingle();
      
    if (oldConfigError) {
      console.error('Error fetching config from Supabase:', oldConfigError.message);
      process.exit(1);
    }
    config = oldConfig ? oldConfig.config_data : {};
  } else {
    config = defaultTenant.config_data || {};
  }

  // 2. Check tenant subscriptions
  await checkTenantSubscriptions(supabase, config);

  // 3. Get active appointments across all tenants
  const { data: appointments, error: aptError } = await supabase
    .from('ronaq_appointments')
    .select('*')
    .eq('status', 'confirmed');

  if (aptError) {
    console.error('Error fetching appointments:', aptError.message);
    process.exit(1);
  }

  console.log(`Checking ${appointments.length} confirmed appointments...`);

  const now = new Date();
  const tenantConfigs = new Map();

  for (const apt of appointments) {
    const aptTime = new Date(`${apt.date}T${apt.time || '00:00'}:00`);
    if (aptTime <= now) continue; // Past appointment

    const sent = Array.isArray(apt.reminders_sent) ? apt.reminders_sent : [];
    const tenantSlug = apt.tenant_slug || 'default';

    // Load tenant specific config for message brand/activities/services names
    let tenantConfig = tenantConfigs.get(tenantSlug);
    if (!tenantConfig) {
      const { data: row } = await supabase
        .from('ronaq_saas_clients')
        .select('config_data')
        .eq('tenant_slug', tenantSlug)
        .maybeSingle();
      
      tenantConfig = row ? row.config_data : config;
      tenantConfigs.set(tenantSlug, tenantConfig);
    }

    const wa = tenantConfig.whatsappApi || config.whatsappApi || {};
    if (!wa.enabled || wa.provider === 'none' || !wa.sendReminder) {
      continue; // Reminders disabled for this tenant
    }

    const reminders = wa.reminders || (tenantConfig.booking && tenantConfig.booking.reminders) || {};
    if (reminders.enabled === false) {
      continue;
    }

    let hoursBefore = Array.isArray(reminders.hoursBefore) ? reminders.hoursBefore : [24, 2];
    hoursBefore = hoursBefore.map(h => parseInt(h, 10)).filter(h => h > 0);
    const windowMinutes = parseInt(reminders.windowMinutes, 10) || 60;

    for (const hours of hoursBefore) {
      if (sent.includes(hours)) continue; // Already sent

      const remindAt = new Date(aptTime.getTime() - hours * 60 * 60 * 1000);
      const windowEnd = new Date(remindAt.getTime() + windowMinutes * 60 * 1000);

      if (now >= remindAt && now < aptTime) {
        // Due! Let's send
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

        console.log(`Sending reminder ${hours}h for appointment ${apt.id} to ${apt.phone}...`);

        try {
          await sendWhatsAppMessage(apt.phone, body, 'reminder', {
            id: apt.id,
            activityId: apt.activity_id,
            serviceId: apt.service_id,
            date: apt.date,
            time: apt.time,
            customerName: apt.customer_name,
            phone: apt.phone,
            district: apt.district,
            locationAddress: apt.location_address,
            notes: apt.notes,
            partySize: apt.party_size,
            nights: apt.nights,
            status: apt.status
          }, tenantConfig);

          // Update DB
          sent.push(hours);
          const { error: updateError } = await supabase
            .from('ronaq_appointments')
            .update({ reminders_sent: sent, updated_at: new Date().toISOString() })
            .eq('id', apt.id);

          if (updateError) {
            console.error(`Failed to update reminder status for appointment ${apt.id} in DB:`, updateError.message);
          } else {
            console.log(`Successfully sent and recorded reminder for ${apt.id}`);
          }
        } catch (err) {
          console.error(`Failed to send reminder for appointment ${apt.id}:`, err.message);
        }
      }
    }
  }

  console.log('--- Done checking reminders ---');
  process.exit(0);
}

run();
