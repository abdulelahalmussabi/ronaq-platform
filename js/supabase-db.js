/**
 * وسيط الاتصال بقاعدة بيانات Supabase — منصة رونق
 */
(function () {
  'use strict';

  var _client = null;

  function sha256(message) {
    if (!message) return Promise.resolve('');
    var msgBuffer = new TextEncoder().encode(message);
    return crypto.subtle.digest('SHA-256', msgBuffer).then(function (hashBuffer) {
      var hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(function (b) {
        return ('00' + b.toString(16)).slice(-2);
      }).join('');
    });
  }

  function getClient() {
    if (_client) return _client;

    try {
      var raw = localStorage.getItem('ronaq_platform_config');
      if (raw) {
        var config = JSON.parse(raw);
        if (config && config.supabase && config.supabase.enabled) {
          var url = config.supabase.url;
          var key = config.supabase.key;
          if (url && key && window.supabase) {
            _client = window.supabase.createClient(url, key);
            return _client;
          }
        }
      }
    } catch (e) {
      console.error('Failed to parse config for Supabase', e);
    }
    return null;
  }

  function isConfigured() {
    return !!getClient();
  }

  function reinit(url, key, enabled) {
    _client = null;
    if (enabled && url && key && window.supabase) {
      try {
        _client = window.supabase.createClient(url, key);
        return true;
      } catch (e) {
        console.error('Failed to initialize Supabase client', e);
      }
    }
    return false;
  }

  function fetchConfig(tenantSlug) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Supabase not configured'));

    var slug = tenantSlug || 'default';
    return client
      .from('ronaq_saas_clients')
      .select('*')
      .eq('tenant_slug', slug)
      .maybeSingle()
      .then(function (res) {
        if (res.error) {
          // Fallback to old table if new table does not exist yet
          return client
            .from('ronaq_config')
            .select('config_data')
            .eq('id', 1)
            .maybeSingle()
            .then(function (oldRes) {
              if (oldRes.error) throw oldRes.error;
              return oldRes.data ? oldRes.data.config_data : null;
            });
        }
        if (!res.data) return null;
        
        var data = res.data.config_data || {};
        data.subscription = {
          status: res.data.subscription_status,
          start: res.data.subscription_start,
          end: res.data.subscription_end,
          businessName: res.data.business_name,
          email: res.data.email,
          phone: res.data.phone,
          tenantSlug: res.data.tenant_slug
        };
        return data;
      });
  }

  function saveConfig(configData, tenantSlug) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Supabase not configured'));

    var slug = tenantSlug || 'default';

    return client
      .from('ronaq_saas_clients')
      .select('id')
      .eq('tenant_slug', slug)
      .maybeSingle()
      .then(function (res) {
        if (res.error || !res.data) {
          // If error or not found, try to insert
          var oneYear = new Date();
          oneYear.setFullYear(oneYear.getFullYear() + 1);
          return client
            .from('ronaq_saas_clients')
            .insert({
              tenant_slug: slug,
              business_name: (configData.brand && configData.brand.name) || 'منشأة جديدة',
              email: slug + '@ronaq.com',
              phone: configData.phone || '9665056138908',
              subscription_end: oneYear.toISOString(),
              config_data: configData,
              subscription_status: 'active'
            });
        } else {
          // Update existing
          return client
            .from('ronaq_saas_clients')
            .update({
              config_data: configData,
              updated_at: new Date().toISOString()
            })
            .eq('tenant_slug', slug);
        }
      })
      .then(function (res) {
        if (res.error) throw res.error;
        return configData;
      });
  }

  function fetchAppointments(tenantSlug) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Supabase not configured'));

    var slug = tenantSlug || 'default';
    
    // Check if there is an authenticated user session
    var user = null;
    if (client.auth) {
      if (client.auth.user) {
        user = client.auth.user();
      } else if (client.auth.getUser) {
        var session = client.auth.session ? client.auth.session() : null;
        user = session ? session.user : null;
      }
    }

    var targetTable = user ? 'ronaq_appointments' : 'ronaq_public_appointments';

    return client
      .from(targetTable)
      .select('*')
      .eq('tenant_slug', slug)
      .order('created_at', { ascending: true })
      .then(function (res) {
        if (res.error) {
          // Fallback if tenant_slug column doesn't exist yet
          return client
            .from(targetTable)
            .select('*')
            .order('created_at', { ascending: true })
            .then(function (fallbackRes) {
              if (fallbackRes.error) throw fallbackRes.error;
              return (fallbackRes.data || []).map(mapRowToAppointment);
            });
        }
        return (res.data || []).map(mapRowToAppointment);
      });
  }

  function mapRowToAppointment(row) {
    return {
      id: row.id,
      tenantSlug: row.tenant_slug || 'default',
      activityId: row.activity_id,
      serviceId: row.service_id,
      date: row.date,
      time: row.time,
      customerName: row.customer_name || '',
      phone: row.phone || '',
      district: row.district || '',
      locationAddress: row.location_address || '',
      notes: row.notes || '',
      partySize: row.party_size,
      nights: row.nights,
      status: row.status,
      remindersSent: row.reminders_sent || [],
      createdAt: row.created_at,
      paymentStatus: row.payment_status || 'unpaid',
      paymentId: row.payment_id || null,
      paymentMethod: row.payment_method || null,
      paymentAmount: row.payment_amount != null ? Number(row.payment_amount) : null
    };
  }

  function saveAppointment(apt, tenantSlug) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Supabase not configured'));

    var slug = tenantSlug || apt.tenantSlug || 'default';
    return client
      .from('ronaq_appointments')
      .upsert({
        id: apt.id,
        tenant_slug: slug,
        activity_id: apt.activityId,
        service_id: apt.serviceId,
        date: apt.date,
        time: apt.time,
        customer_name: apt.customerName,
        phone: apt.phone,
        district: apt.district,
        location_address: apt.locationAddress,
        notes: apt.notes,
        party_size: apt.partySize,
        nights: apt.nights,
        status: apt.status,
        reminders_sent: apt.remindersSent || [],
        created_at: apt.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        payment_status: apt.paymentStatus || 'unpaid',
        payment_id: apt.paymentId || null,
        payment_method: apt.paymentMethod || null,
        payment_amount: apt.paymentAmount != null ? Number(apt.paymentAmount) : null
      })
      .then(function (res) {
        if (res.error) throw res.error;
        return apt;
      });
  }

  function saveAppointmentsBulk(apts, tenantSlug) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Supabase not configured'));

    var slug = tenantSlug || 'default';
    var rows = apts.map(function (apt) {
      return {
        id: apt.id,
        tenant_slug: slug,
        activity_id: apt.activityId,
        service_id: apt.serviceId,
        date: apt.date,
        time: apt.time,
        customer_name: apt.customerName,
        phone: apt.phone,
        district: apt.district,
        location_address: apt.locationAddress,
        notes: apt.notes,
        party_size: apt.partySize,
        nights: apt.nights,
        status: apt.status,
        reminders_sent: apt.remindersSent || [],
        created_at: apt.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        payment_status: apt.paymentStatus || 'unpaid',
        payment_id: apt.paymentId || null,
        payment_method: apt.paymentMethod || null,
        payment_amount: apt.paymentAmount != null ? Number(apt.paymentAmount) : null
      };
    });

    return client
      .from('ronaq_appointments')
      .upsert(rows)
      .then(function (res) {
        if (res.error) throw res.error;
        return apts;
      });
  }

  function mapRowToOrder(row) {
    return {
      id: row.id,
      tenantSlug: row.tenant_slug || 'default',
      activityId: row.activity_id,
      activityTitle: row.activity_title || '',
      items: typeof row.items === 'string' ? JSON.parse(row.items) : (row.items || []),
      customerName: row.customer_name,
      phone: row.phone,
      district: row.district || '',
      locationAddress: row.location_address || '',
      notes: row.notes || '',
      status: row.status || 'pending',
      createdAt: row.created_at,
      paymentStatus: row.payment_status || 'unpaid',
      paymentId: row.payment_id || null,
      paymentMethod: row.payment_method || null,
      paymentAmount: row.payment_amount != null ? Number(row.payment_amount) : null
    };
  }

  function fetchOrders(tenantSlug) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Supabase not configured'));

    var slug = tenantSlug || 'default';
    return client
      .from('ronaq_orders')
      .select('*')
      .eq('tenant_slug', slug)
      .order('created_at', { ascending: false })
      .then(function (res) {
        if (res.error) throw res.error;
        return (res.data || []).map(mapRowToOrder);
      });
  }

  function saveOrder(order, tenantSlug) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Supabase not configured'));

    var slug = tenantSlug || order.tenantSlug || 'default';
    return client
      .from('ronaq_orders')
      .upsert({
        id: order.id,
        tenant_slug: slug,
        activity_id: order.activityId,
        activity_title: order.activityTitle || '',
        items: order.items || [],
        customer_name: order.customerName,
        phone: order.phone,
        district: order.district || null,
        location_address: order.locationAddress || null,
        notes: order.notes || null,
        status: order.status || 'pending',
        created_at: order.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        payment_status: order.paymentStatus || 'unpaid',
        payment_id: order.paymentId || null,
        payment_method: order.paymentMethod || null,
        payment_amount: order.paymentAmount != null ? Number(order.paymentAmount) : null
      })
      .then(function (res) {
        if (res.error) throw res.error;
        return order;
      });
  }

  function saveOrdersBulk(orders, tenantSlug) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Supabase not configured'));

    var slug = tenantSlug || 'default';
    var rows = orders.map(function (order) {
      return {
        id: order.id,
        tenant_slug: slug,
        activity_id: order.activityId,
        activity_title: order.activityTitle || '',
        items: order.items || [],
        customer_name: order.customerName,
        phone: order.phone,
        district: order.district || null,
        location_address: order.locationAddress || null,
        notes: order.notes || null,
        status: order.status || 'pending',
        created_at: order.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        payment_status: order.paymentStatus || 'unpaid',
        payment_id: order.paymentId || null,
        payment_method: order.paymentMethod || null,
        payment_amount: order.paymentAmount != null ? Number(order.paymentAmount) : null
      };
    });

    return client
      .from('ronaq_orders')
      .upsert(rows)
      .then(function (res) {
        if (res.error) throw res.error;
        return orders;
      });
  }

  function deleteOrder(id) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Supabase not configured'));

    return client
      .from('ronaq_orders')
      .delete()
      .eq('id', id)
      .then(function (res) {
        if (res.error) throw res.error;
        return id;
      });
  }

  function deleteAppointment(id) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Supabase not configured'));

    return client
      .from('ronaq_appointments')
      .delete()
      .eq('id', id)
      .then(function (res) {
        if (res.error) throw res.error;
        return id;
      });
  }

  function fetchInvoices(tenantSlug) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Supabase not configured'));

    var slug = tenantSlug || 'default';
    return client
      .from('ronaq_saas_invoices')
      .select('*')
      .eq('tenant_slug', slug)
      .order('created_at', { ascending: false })
      .then(function (res) {
        if (res.error) throw res.error;
        return (res.data || []).map(function (row) {
          return {
            id: row.id,
            tenantSlug: row.tenant_slug,
            amount: Number(row.amount),
            months: row.months,
            status: row.status,
            paymentId: row.payment_id,
            paymentMethod: row.payment_method,
            createdAt: row.created_at,
            updatedAt: row.updated_at
          };
        });
      });
  }

  function saveInvoice(inv, tenantSlug) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Supabase not configured'));

    var slug = tenantSlug || inv.tenantSlug || 'default';
    return client
      .from('ronaq_saas_invoices')
      .upsert({
        id: inv.id,
        tenant_slug: slug,
        amount: Number(inv.amount),
        months: inv.months || 12,
        status: inv.status || 'unpaid',
        payment_id: inv.paymentId || null,
        payment_method: inv.paymentMethod || null,
        created_at: inv.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .then(function (res) {
        if (res.error) throw res.error;
        return inv;
      });
  }

  function fetchStaff(tenantSlug) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Supabase not configured'));

    var slug = tenantSlug || 'default';
    return client
      .from('ronaq_staff')
      .select('*')
      .eq('tenant_slug', slug)
      .order('name', { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        return (res.data || []).map(function (row) {
          return {
            id: row.id,
            tenantSlug: row.tenant_slug,
            name: row.name,
            phone: row.phone,
            email: row.email,
            role: row.role,
            pinCode: '****',
            status: row.status,
            createdAt: row.created_at
          };
        });
      });
  }

  function saveStaff(member, tenantSlug) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Supabase not configured'));

    var slug = tenantSlug || member.tenantSlug || 'default';
    
    var pinPromise = Promise.resolve(null);
    if (member.pinCode && member.pinCode.trim() !== '' && member.pinCode !== '****') {
      pinPromise = sha256(member.pinCode.trim());
    }

    return pinPromise.then(function (hashedPin) {
      var payload = {
        id: member.id,
        tenant_slug: slug,
        name: member.name,
        phone: member.phone,
        email: member.email || null,
        role: member.role || 'technician',
        status: member.status || 'active',
        created_at: member.createdAt || new Date().toISOString()
      };

      if (hashedPin) {
        payload.pin_code = hashedPin;
      }

      return client
        .from('ronaq_staff')
        .upsert(payload)
        .then(function (res) {
          if (res.error) throw res.error;
          return member;
        });
    });
  }

  function deleteStaff(id) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Supabase not configured'));

    return client
      .from('ronaq_staff')
      .delete()
      .eq('id', id)
      .then(function (res) {
        if (res.error) throw res.error;
        return id;
      });
  }

  function fetchApiKeys(tenantSlug) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Supabase not configured'));

    var slug = tenantSlug || 'default';
    return client
      .from('ronaq_api_keys')
      .select('*')
      .eq('tenant_slug', slug)
      .order('created_at', { ascending: false })
      .then(function (res) {
        if (res.error) throw res.error;
        return (res.data || []).map(function (row) {
          return {
            id: row.id,
            tenantSlug: row.tenant_slug,
            keyName: row.key_name,
            apiKey: row.api_key,
            createdAt: row.created_at,
            expiresAt: row.expires_at
          };
        });
      });
  }

  function saveApiKey(keyObj, tenantSlug) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Supabase not configured'));

    var slug = tenantSlug || 'default';
    return client
      .from('ronaq_api_keys')
      .upsert({
        id: keyObj.id || undefined,
        tenant_slug: slug,
        key_name: keyObj.keyName,
        api_key: keyObj.apiKey,
        expires_at: keyObj.expiresAt || null
      })
      .then(function (res) {
        if (res.error) throw res.error;
        return keyObj;
      });
  }

  function deleteApiKey(id) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Supabase not configured'));

    return client
      .from('ronaq_api_keys')
      .delete()
      .eq('id', id)
      .then(function (res) {
        if (res.error) throw res.error;
        return id;
      });
  }

  function testConnection(url, key) {
    if (!window.supabase) return Promise.reject(new Error('مكتبة Supabase غير محملة على هذا المتصفح.'));
    try {
      var tempClient = window.supabase.createClient(url, key);
      return tempClient
        .from('ronaq_saas_clients')
        .select('id')
        .limit(1)
        .then(function (res) {
          if (res.error) {
            // Check old table
            return tempClient
              .from('ronaq_config')
              .select('id')
              .limit(1)
              .then(function (oldRes) {
                if (oldRes.error) {
                  return { success: true, schemaMissing: true };
                }
                return { success: true, schemaMissing: false };
              });
          }
          return { success: true, schemaMissing: false };
        });
    } catch (e) {
      return Promise.reject(e);
    }
  }

  function getInitSql() {
    return [
      '-- 1. إنشاء جدول العملاء (المستأجرين) لنظام SAAS',
      'CREATE TABLE IF NOT EXISTS ronaq_saas_clients (',
      '    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),',
      '    tenant_slug TEXT UNIQUE NOT NULL,',
      '    owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,',
      '    business_name TEXT NOT NULL,',
      '    email TEXT UNIQUE NOT NULL,',
      '    phone TEXT NOT NULL,',
      '    subscription_status TEXT DEFAULT \'active\',',
      '    subscription_start TIMESTAMPTZ DEFAULT NOW(),',
      '    subscription_end TIMESTAMPTZ NOT NULL,',
      '    config_data JSONB NOT NULL,',
      '    saved_config_data JSONB,',
      '    reminders_sent JSONB DEFAULT \'[]\'::jsonb,',
      '    created_at TIMESTAMPTZ DEFAULT NOW(),',
      '    updated_at TIMESTAMPTZ DEFAULT NOW()',
      ');',
      '',
      '-- 2. إنشاء جدول المواعيد وتطويره لدعم المستأجرين',
      'CREATE TABLE IF NOT EXISTS ronaq_appointments (',
      '    id TEXT PRIMARY KEY,',
      '    tenant_slug TEXT DEFAULT \'default\',',
      '    activity_id TEXT NOT NULL,',
      '    service_id TEXT NOT NULL,',
      '    date TEXT NOT NULL,',
      '    time TEXT NOT NULL,',
      '    customer_name TEXT NOT NULL,',
      '    phone TEXT NOT NULL,',
      '    district TEXT,',
      '    location_address TEXT,',
      '    notes TEXT,',
      '    party_size INTEGER,',
      '    nights INTEGER,',
      '    status TEXT DEFAULT \'pending\',',
      '    reminders_sent JSONB DEFAULT \'[]\'::jsonb,',
      '    created_at TIMESTAMPTZ DEFAULT NOW(),',
      '    updated_at TIMESTAMPTZ DEFAULT NOW(),',
      '    payment_status TEXT DEFAULT \'unpaid\',',
      '    payment_id TEXT,',
      '    payment_method TEXT,',
      '    payment_amount NUMERIC',
      ');',
      '',
      '-- 3. إنشاء جدول الطلبات وتفعيله لدعم المستأجرين',
      'CREATE TABLE IF NOT EXISTS ronaq_orders (',
      '    id TEXT PRIMARY KEY,',
      '    tenant_slug TEXT DEFAULT \'default\',',
      '    activity_id TEXT NOT NULL,',
      '    activity_title TEXT,',
      '    items JSONB DEFAULT \'[]\'::jsonb,',
      '    customer_name TEXT NOT NULL,',
      '    phone TEXT NOT NULL,',
      '    district TEXT,',
      '    location_address TEXT,',
      '    notes TEXT,',
      '    status TEXT DEFAULT \'pending\',',
      '    created_at TIMESTAMPTZ DEFAULT NOW(),',
      '    updated_at TIMESTAMPTZ DEFAULT NOW(),',
      '    payment_status TEXT DEFAULT \'unpaid\',',
      '    payment_id TEXT,',
      '    payment_method TEXT,',
      '    payment_amount NUMERIC',
      ');',
      '',
      '-- 4. إنشاء جدول الموظفين/الفنيين ronaq_staff',
      'CREATE TABLE IF NOT EXISTS ronaq_staff (',
      '    id TEXT PRIMARY KEY,',
      '    tenant_slug TEXT NOT NULL,',
      '    name TEXT NOT NULL,',
      '    phone TEXT NOT NULL,',
      '    email TEXT,',
      '    role TEXT DEFAULT \'technician\',',
      '    pin_code TEXT NOT NULL,',
      '    status TEXT DEFAULT \'active\',',
      '    created_at TIMESTAMPTZ DEFAULT NOW()',
      ');',
      '',
      '-- 5. ربط جدول المواعيد بالفنيين المباشرين',
      'ALTER TABLE ronaq_appointments ADD COLUMN IF NOT EXISTS staff_id TEXT REFERENCES ronaq_staff(id) ON DELETE SET NULL;',
      '',
      '-- 6. إنشاء جدول الأجهزة والتوثيق الحيوي للفنيين ronaq_staff_devices',
      'CREATE TABLE IF NOT EXISTS ronaq_staff_devices (',
      '    id TEXT PRIMARY KEY,',
      '    staff_id TEXT NOT NULL REFERENCES ronaq_staff(id) ON DELETE CASCADE,',
      '    device_name TEXT NOT NULL,',
      '    credential_id TEXT UNIQUE NOT NULL,',
      '    public_key TEXT NOT NULL,',
      '    counter INTEGER DEFAULT 0,',
      '    created_at TIMESTAMPTZ DEFAULT NOW()',
      ');',
      '',
      '-- 7. إنشاء جدول الفواتير لـ SaaS ronaq_saas_invoices',
      'CREATE TABLE IF NOT EXISTS ronaq_saas_invoices (',
      '    id TEXT PRIMARY KEY,',
      '    tenant_slug TEXT NOT NULL REFERENCES ronaq_saas_clients(tenant_slug) ON DELETE CASCADE,',
      '    amount NUMERIC NOT NULL,',
      '    months INTEGER NOT NULL,',
      '    status TEXT DEFAULT \'unpaid\',',
      '    payment_id TEXT,',
      '    payment_method TEXT,',
      '    created_at TIMESTAMPTZ DEFAULT NOW(),',
      '    updated_at TIMESTAMPTZ DEFAULT NOW()',
      ');',
      '',
      '-- 8. إنشاء جدول مفاتيح الـ API للتكامل الخارجي ronaq_api_keys',
      'CREATE TABLE IF NOT EXISTS ronaq_api_keys (',
      '    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),',
      '    tenant_slug TEXT NOT NULL REFERENCES ronaq_saas_clients(tenant_slug) ON DELETE CASCADE,',
      '    key_name TEXT NOT NULL,',
      '    api_key TEXT UNIQUE NOT NULL,',
      '    created_at TIMESTAMPTZ DEFAULT NOW(),',
      '    expires_at TIMESTAMPTZ',
      ');',
      '',
      '-- 9. إدراج مستأجر افتراضي للتوافق الكامل',
      'INSERT INTO ronaq_saas_clients (tenant_slug, business_name, email, phone, subscription_end, config_data)',
      'VALUES (\'default\', \'المنصة الافتراضية\', \'default@ronaq.com\', \'9665056138908\', NOW() + INTERVAL \'10 years\', \'{}\'::jsonb)',
      'ON CONFLICT (tenant_slug) DO NOTHING;',
      '',
      '-- 10. تفعيل الحماية والأمان (RLS)',
      'DROP POLICY IF EXISTS "Allow public read appointments" ON ronaq_appointments;',
      'DROP POLICY IF EXISTS "Allow public read orders" ON ronaq_orders;',
      'DROP POLICY IF EXISTS "Allow public read staff" ON ronaq_staff;',
      'DROP POLICY IF EXISTS "Allow public read staff devices" ON ronaq_staff_devices;',
      'ALTER TABLE ronaq_saas_clients ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE ronaq_appointments ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE ronaq_orders ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE ronaq_staff ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE ronaq_staff_devices ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE ronaq_saas_invoices ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE ronaq_api_keys ENABLE ROW LEVEL SECURITY;',
      '',
      '-- 11. سياسات الأمان لجدول العملاء ronaq_saas_clients',
      'CREATE POLICY "Allow public read on clients" ON ronaq_saas_clients FOR SELECT USING (true);',
      'CREATE POLICY "Allow owner manage client" ON ronaq_saas_clients FOR ALL TO authenticated ',
      '  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);',
      '',
      '-- 12. سياسات الأمان لجدول المواعيد ronaq_appointments',
      'CREATE POLICY "Allow public insert on appointments" ON ronaq_appointments FOR INSERT WITH CHECK (true);',
      'CREATE POLICY "Allow owner manage appointments" ON ronaq_appointments FOR ALL TO authenticated ',
      '  USING (auth.uid() = (SELECT owner_id FROM ronaq_saas_clients WHERE tenant_slug = ronaq_appointments.tenant_slug LIMIT 1));',
      '',
      '-- 13. سياسات الأمان لجدول الطلبات ronaq_orders',
      'CREATE POLICY "Allow public insert on orders" ON ronaq_orders FOR INSERT WITH CHECK (true);',
      'CREATE POLICY "Allow owner manage orders" ON ronaq_orders FOR ALL TO authenticated ',
      '  USING (auth.uid() = (SELECT owner_id FROM ronaq_saas_clients WHERE tenant_slug = ronaq_orders.tenant_slug LIMIT 1));',
      '',
      '-- 14. سياسات الأمان لجدول الموظفين ronaq_staff',
      'CREATE POLICY "Allow owner manage staff" ON ronaq_staff FOR ALL TO authenticated ',
      '  USING (auth.uid() = (SELECT owner_id FROM ronaq_saas_clients WHERE tenant_slug = ronaq_staff.tenant_slug LIMIT 1));',
      '',
      '-- 15. سياسات الأمان للفواتير ronaq_saas_invoices',
      'CREATE POLICY "Allow owner read invoices" ON ronaq_saas_invoices FOR SELECT TO authenticated ',
      '  USING (auth.uid() = (SELECT owner_id FROM ronaq_saas_clients WHERE tenant_slug = ronaq_saas_invoices.tenant_slug LIMIT 1));',
      '',
      '-- 16. سياسات الأمان لمفاتيح الـ API',
      'CREATE POLICY "Allow owner manage api keys" ON ronaq_api_keys FOR ALL TO authenticated ',
      '  USING (auth.uid() = (SELECT owner_id FROM ronaq_saas_clients WHERE tenant_slug = ronaq_api_keys.tenant_slug LIMIT 1));',
      '',
      '-- 17. إنشاء منظر عام للمواعيد لا يعرض معلومات حساسة',
      'CREATE OR REPLACE VIEW ronaq_public_appointments AS ',
      '  SELECT id, tenant_slug, activity_id, service_id, date, time, status FROM ronaq_appointments;',
      'GRANT SELECT ON ronaq_public_appointments TO anon;',
      'GRANT SELECT ON ronaq_public_appointments TO authenticated;',
      '',
      '-- 18. دالة التحقق من رمز PIN للموظفين بشكل آمن',
      'CREATE OR REPLACE FUNCTION verify_staff_pin(p_tenant text, p_phone text, p_pin_hash text) ',
      'RETURNS jsonb SECURITY DEFINER AS $$',
      'DECLARE',
      '    v_staff record;',
      'BEGIN',
      '    SELECT id, name, role, phone, tenant_slug, status INTO v_staff ',
      '    FROM ronaq_staff ',
      '    WHERE tenant_slug = p_tenant AND phone = p_phone AND pin_code = p_pin_hash AND status = \'active\';',
      '    IF FOUND THEN',
      '        RETURN jsonb_build_object(\'success\', true, \'id\', v_staff.id, \'name\', v_staff.name, \'role\', v_staff.role, \'phone\', v_staff.phone, \'tenantSlug\', v_staff.tenant_slug);',
      '    ELSE',
      '        RETURN jsonb_build_object(\'success\', false);',
      '    END IF;',
      'END;',
      '$$ LANGUAGE plpgsql;',
      'GRANT EXECUTE ON FUNCTION verify_staff_pin(text, text, text) TO anon;',
      'GRANT EXECUTE ON FUNCTION verify_staff_pin(text, text, text) TO authenticated;',
      '',
      '-- 19. دالة جلب مهام الفنيين بشكل آمن',
      'CREATE OR REPLACE FUNCTION get_staff_appointments(p_staff_id text) ',
      'RETURNS SETOF ronaq_appointments SECURITY DEFINER AS $$',
      'BEGIN',
      '    RETURN QUERY SELECT * FROM ronaq_appointments WHERE staff_id = p_staff_id;',
      'END;',
      '$$ LANGUAGE plpgsql;',
      'GRANT EXECUTE ON FUNCTION get_staff_appointments(text) TO anon;',
      'GRANT EXECUTE ON FUNCTION get_staff_appointments(text) TO authenticated;',
      '',
      '-- 20. دالة تحديث حالة المهمة للفني بشكل آمن',
      'CREATE OR REPLACE FUNCTION update_staff_appointment_status(p_appointment_id text, p_staff_id text, p_new_status text) ',
      'RETURNS jsonb SECURITY DEFINER AS $$',
      'BEGIN',
      '    UPDATE ronaq_appointments ',
      '    SET status = p_new_status, updated_at = NOW() ',
      '    WHERE id = p_appointment_id AND staff_id = p_staff_id;',
      '    IF FOUND THEN',
      '        RETURN jsonb_build_object(\'success\', true);',
      '    ELSE',
      '        RETURN jsonb_build_object(\'success\', false, \'error\', \'Appointment not found or not assigned to this staff member\');',
      '    END IF;',
      'END;',
      '$$ LANGUAGE plpgsql;',
      'GRANT EXECUTE ON FUNCTION update_staff_appointment_status(text, text, text) TO anon;',
      'GRANT EXECUTE ON FUNCTION update_staff_appointment_status(text, text, text) TO authenticated;'
    ].join('\n');
  }

  window.RonaqSupabaseDb = {
    isConfigured: isConfigured,
    reinit: reinit,
    fetchConfig: fetchConfig,
    saveConfig: saveConfig,
    fetchAppointments: fetchAppointments,
    saveAppointment: saveAppointment,
    saveAppointmentsBulk: saveAppointmentsBulk,
    deleteAppointment: deleteAppointment,
    fetchOrders: fetchOrders,
    saveOrder: saveOrder,
    saveOrdersBulk: saveOrdersBulk,
    deleteOrder: deleteOrder,
    // advanced CRUD exports
    fetchInvoices: fetchInvoices,
    saveInvoice: saveInvoice,
    fetchStaff: fetchStaff,
    saveStaff: saveStaff,
    deleteStaff: deleteStaff,
    fetchApiKeys: fetchApiKeys,
    saveApiKey: saveApiKey,
    deleteApiKey: deleteApiKey,
    testConnection: testConnection,
    getInitSql: getInitSql,
    getClient: getClient,
  };
})();
