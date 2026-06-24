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
      var config = null;
      if (window.MkenServicesStore && typeof window.MkenServicesStore.loadConfig === 'function') {
        config = window.MkenServicesStore.loadConfig();
      }
      if (!config) {
        var raw = localStorage.getItem('mken_platform_config');
        if (raw) {
          config = JSON.parse(raw);
        }
      }
      if (config && config.supabase) {
        var url = config.supabase.url;
        var key = config.supabase.key;
        if (url && key && window.supabase) {
          _client = window.supabase.createClient(url, key);
          return _client;
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

  // --- Offline Caching & Synchronization Core ---
  var SYNC_QUEUE_KEY = 'mken_sync_queue';
  var isSyncing = false;

  function getCache(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error('Failed to get cache for ' + key, e);
      return null;
    }
  }

  function setCache(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to set cache for ' + key, e);
    }
  }

  function updateLocalCacheArray(cacheKey, newItem) {
    var list = getCache(cacheKey) || [];
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === newItem.id) {
        idx = i;
        break;
      }
    }
    if (idx !== -1) {
      list[idx] = newItem;
    } else {
      list.push(newItem);
    }
    setCache(cacheKey, list);
  }

  function getSyncQueue() {
    try {
      var raw = localStorage.getItem(SYNC_QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveSyncQueue(queue) {
    try {
      localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
      // Dispatch event to notify UI
      var event;
      if (typeof(Event) === 'function') {
        event = new Event('mken_sync_queue_changed');
      } else {
        event = document.createEvent('Event');
        event.initEvent('mken_sync_queue_changed', true, true);
      }
      window.dispatchEvent(event);
    } catch (e) {
      console.error('Failed to save sync queue', e);
    }
  }

  function addToSyncQueue(action, payload, tenantSlug) {
    var queue = getSyncQueue();
    queue.push({
      id: 'sq_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      action: action,
      payload: payload,
      tenantSlug: tenantSlug || 'default',
      timestamp: new Date().toISOString()
    });
    saveSyncQueue(queue);
  }

  function getPendingSyncCount() {
    return getSyncQueue().length;
  }

  function processSyncQueue() {
    if (isSyncing || !navigator.onLine) return;
    var client = getClient();
    if (!client) return;

    var queue = getSyncQueue();
    if (!queue.length) return;

    isSyncing = true;
    console.log('Processing offline sync queue of ' + queue.length + ' item(s)...');

    function syncNext() {
      var currentQueue = getSyncQueue();
      if (!currentQueue.length) {
        isSyncing = false;
        console.log('Offline sync queue successfully processed!');
        if (window.MkenAdminToast) {
          window.MkenAdminToast('تمت مزامنة جميع العمليات المعلقة بنجاح');
        }
        if (window.MkenAdminInvoices) window.MkenAdminInvoices.refresh();
        if (window.MkenAdminCustomers) window.MkenAdminCustomers.refresh();
        if (window.MkenAdminInventory) window.MkenAdminInventory.refresh();
        if (window.MkenAdminPurchases) window.MkenAdminPurchases.refresh();
        return;
      }

      var item = currentQueue[0];
      var promise = null;

      if (item.action === 'saveCustomer') {
        promise = saveCustomer(item.payload, item.tenantSlug, true);
      } else if (item.action === 'saveCustomerInvoice') {
        promise = saveCustomerInvoice(item.payload, item.tenantSlug, true);
      } else if (item.action === 'saveVendor') {
        promise = saveVendor(item.payload, item.tenantSlug, true);
      } else if (item.action === 'savePurchaseInvoice') {
        promise = savePurchaseInvoice(item.payload, item.tenantSlug, true);
      } else if (item.action === 'saveInventoryItem') {
        promise = saveInventoryItem(item.payload, item.tenantSlug, true);
      }

      if (promise) {
        promise.then(function () {
          var updatedQueue = getSyncQueue();
          updatedQueue = updatedQueue.filter(function (qi) { return qi.id !== item.id; });
          saveSyncQueue(updatedQueue);
          setTimeout(syncNext, 100);
        }).catch(function (err) {
          console.error('Failed to sync item in queue: ', item, err);
          isSyncing = false;
        });
      } else {
        // Unknown action, skip
        var updatedQueue = getSyncQueue();
        updatedQueue.shift();
        saveSyncQueue(updatedQueue);
        setTimeout(syncNext, 10);
      }
    }

    syncNext();
  }

  // Register network status event
  window.addEventListener('online', processSyncQueue);
  setTimeout(processSyncQueue, 3000);


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
      .from('mken_saas_clients')
      .select('*')
      .eq('tenant_slug', slug)
      .maybeSingle()
      .then(function (res) {
        if (res.error) {
          // Fallback to old table if new table does not exist yet
          return client
            .from('mken_config')
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
        
        // FOOLPROOF OVERRIDE: If this is a custom tenant and the brand name is "مكن" or empty,
        // force it to use the tenant's registered business name and phone number.
        if (slug !== 'default') {
          if (!data.brand) {
            data.brand = {
              name: res.data.business_name || '',
              tagline: 'مرحباً بك في موقعنا',
              logo: ''
            };
          } else if (!data.brand.name || data.brand.name === 'مكن') {
            data.brand.name = res.data.business_name || data.brand.name || '';
          }
          
          if (!data.phone || data.phone === '966543530333') {
            data.phone = res.data.phone || data.phone || '';
          }
        }

        var originalSub = data.subscription || {};
        data.subscription = {
          status: res.data.subscription_status,
          start: res.data.subscription_start,
          end: res.data.subscription_end,
          businessName: res.data.business_name,
          email: res.data.email,
          phone: res.data.phone,
          tenantSlug: res.data.tenant_slug,
          tier: res.data.subscription_tier || 'basic',
          customFeatures: originalSub.customFeatures || null
        };
        return data;
      });
  }

  function saveConfig(configData, tenantSlug) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Supabase not configured'));

    var slug = tenantSlug || 'default';

    return client
      .from('mken_saas_clients')
      .select('id')
      .eq('tenant_slug', slug)
      .maybeSingle()
      .then(function (res) {
        if (res.error || !res.data) {
          // If error or not found, try to insert
          var oneYear = new Date();
          oneYear.setFullYear(oneYear.getFullYear() + 1);
          return client
            .from('mken_saas_clients')
            .insert({
              tenant_slug: slug,
              business_name: (configData.brand && configData.brand.name) || 'منشأة جديدة',
              email: slug + '@mken.com',
              phone: configData.phone || '966543530333',
              subscription_end: oneYear.toISOString(),
              config_data: configData,
              subscription_status: 'active'
            });
        } else {
          // Update existing
          return client
            .from('mken_saas_clients')
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

    var targetTable = user ? 'mken_appointments' : 'mken_public_appointments';

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
      stayUnit: row.stay_unit || '',
      stayBooking: row.stay_booking === true,
      checkOutTime: row.check_out_time || '',
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
      .from('mken_appointments')
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
        stay_unit: apt.stayUnit || null,
        stay_booking: apt.stayBooking === true,
        check_out_time: apt.checkOutTime || null,
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
        stay_unit: apt.stayUnit || null,
        stay_booking: apt.stayBooking === true,
        check_out_time: apt.checkOutTime || null,
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
      .from('mken_appointments')
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
      .from('mken_orders')
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
      .from('mken_orders')
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
      .from('mken_orders')
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
      .from('mken_orders')
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
      .from('mken_appointments')
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
      .from('mken_saas_invoices')
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
      .from('mken_saas_invoices')
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

  function fetchWhatsappLogs(tenantSlug) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Supabase not configured'));

    var slug = tenantSlug || 'default';
    return client
      .from('mken_whatsapp_logs')
      .select('*')
      .eq('tenant_slug', slug)
      .order('created_at', { ascending: false })
      .then(function (res) {
        if (res.error) throw res.error;
        return (res.data || []).map(function (row) {
          return {
            id: row.id,
            tenantSlug: row.tenant_slug,
            phone: row.phone,
            body: row.body,
            provider: row.provider,
            status: row.status,
            errorMessage: row.error_message,
            eventType: row.event_type,
            appointmentId: row.appointment_id,
            createdAt: row.created_at,
            retryCount: row.retry_count
          };
        });
      });
  }

  function logWhatsappMessage(log, tenantSlug) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Supabase not configured'));

    var slug = tenantSlug || log.tenantSlug || 'default';
    return client
      .from('mken_whatsapp_logs')
      .upsert({
        id: log.id || undefined,
        tenant_slug: slug,
        phone: log.phone,
        body: log.body,
        provider: log.provider,
        status: log.status,
        error_message: log.errorMessage || null,
        event_type: log.eventType || null,
        appointment_id: log.appointmentId || null,
        created_at: log.createdAt || new Date().toISOString(),
        retry_count: log.retryCount || 0
      })
      .then(function (res) {
        if (res.error) throw res.error;
        return res.data;
      });
  }

  function deleteWhatsappLog(id) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Supabase not configured'));

    return client
      .from('mken_whatsapp_logs')
      .delete()
      .eq('id', id)
      .then(function (res) {
        if (res.error) throw res.error;
        return id;
      });
  }

  function fetchStaff(tenantSlug) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Supabase not configured'));

    var slug = tenantSlug || 'default';
    return client
      .from('mken_staff')
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
        .from('mken_staff')
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
      .from('mken_staff')
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
      .from('mken_api_keys')
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
      .from('mken_api_keys')
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
      .from('mken_api_keys')
      .delete()
      .eq('id', id)
      .then(function (res) {
        if (res.error) throw res.error;
        return id;
      });
  }

  function fetchInventoryItems(tenantSlug) {
    var client = getClient();
    var cacheKey = 'mken_cache_inventory';
    var slug = tenantSlug || 'default';

    if (client && navigator.onLine) {
      return client
        .from('mken_inventory_items')
        .select('*')
        .eq('tenant_slug', slug)
        .order('name', { ascending: true })
        .then(function (res) {
          if (res.error) throw res.error;
          var data = (res.data || []).map(function (row) {
            return {
              id: row.id,
              tenantSlug: row.tenant_slug,
              name: row.name,
              sku: row.sku || '',
              barcode: row.barcode || '',
              costPrice: Number(row.cost_price || 0),
              sellPrice: Number(row.sell_price || 0),
              quantity: Number(row.quantity || 0),
              minStockAlert: Number(row.min_stock_alert || 0),
              imageUrl: row.image_url || '',
              createdAt: row.created_at,
              updatedAt: row.updated_at
            };
          });
          setCache(cacheKey, data);
          return data;
        })
        .catch(function (err) {
          console.warn('Supabase fetch failed, falling back to local cache', err);
          var cached = getCache(cacheKey);
          return cached || [];
        });
    } else {
      var cached = getCache(cacheKey);
      return Promise.resolve(cached || []);
    }
  }

  function saveInventoryItem(item, tenantSlug, bypassQueue) {
    var client = getClient();
    var cacheKey = 'mken_cache_inventory';
    var slug = tenantSlug || item.tenantSlug || 'default';

    var localItem = {
      id: item.id,
      tenantSlug: slug,
      name: item.name,
      sku: item.sku || '',
      barcode: item.barcode || '',
      costPrice: Number(item.costPrice || 0),
      sellPrice: Number(item.sellPrice || 0),
      quantity: Number(item.quantity || 0),
      minStockAlert: Number(item.minStockAlert || 0),
      imageUrl: item.imageUrl || '',
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    updateLocalCacheArray(cacheKey, localItem);

    if (client && navigator.onLine && (bypassQueue || getSyncQueue().length === 0)) {
      return client
        .from('mken_inventory_items')
        .upsert({
          id: item.id,
          tenant_slug: slug,
          name: item.name,
          sku: item.sku || null,
          barcode: item.barcode || null,
          cost_price: Number(item.costPrice || 0),
          sell_price: Number(item.sellPrice || 0),
          quantity: Number(item.quantity || 0),
          min_stock_alert: Number(item.minStockAlert || 0),
          image_url: item.imageUrl || null,
          created_at: item.createdAt || new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .then(function (res) {
          if (res.error) throw res.error;
          return item;
        })
        .catch(function (err) {
          if (bypassQueue) throw err;
          console.warn('Supabase save failed, adding to sync queue', err);
          addToSyncQueue('saveInventoryItem', item, slug);
          if (window.MkenAdminToast) {
            window.MkenAdminToast('تم حفظ الصنف محلياً وسيتم مزامنته عند توفر الاتصال');
          }
          return item;
        });
    } else {
      if (!bypassQueue) {
        addToSyncQueue('saveInventoryItem', item, slug);
        if (window.MkenAdminToast) {
          window.MkenAdminToast('تم حفظ الصنف محلياً وسيتم مزامنته عند توفر الاتصال');
        }
      }
      return Promise.resolve(item);
    }
  }

  function deleteInventoryItem(id) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Supabase not configured'));

    return client
      .from('mken_inventory_items')
      .delete()
      .eq('id', id)
      .then(function (res) {
        if (res.error) throw res.error;
        return id;
      });
  }

  function fetchCustomerInvoices(tenantSlug) {
    var client = getClient();
    var cacheKey = 'mken_cache_invoices';
    var slug = tenantSlug || 'default';

    if (client && navigator.onLine) {
      return client
        .from('mken_invoices')
        .select('*')
        .eq('tenant_slug', slug)
        .order('created_at', { ascending: false })
        .then(function (res) {
          if (res.error) throw res.error;
          var data = (res.data || []).map(function (row) {
            var items = row.items || [];
            var zatcaMeta = items.find(function(x) { return x && x.isZatcaMeta; });
            var cleanItems = items.filter(function(x) { return x && !x.isZatcaMeta; });

            return {
              id: row.id,
              tenantSlug: row.tenant_slug,
              customerId: row.customer_id || null,
              customerName: row.customer_name,
              customerPhone: row.customer_phone || '',
              items: cleanItems,
              subtotal: Number(row.subtotal || 0),
              taxAmount: Number(row.tax_amount || 0),
              discount: Number(row.discount || 0),
              totalAmount: Number(row.total_amount || 0),
              paymentStatus: row.payment_status || 'unpaid',
              paymentMethod: row.payment_method || '',
              type: row.type || 'invoice',
              createdAt: row.created_at,
              updatedAt: row.updated_at,
              zatcaStatus: zatcaMeta ? zatcaMeta.zatcaStatus : null,
              zatcaUuid: zatcaMeta ? zatcaMeta.zatcaUuid : null,
              zatcaXmlHash: zatcaMeta ? zatcaMeta.zatcaXmlHash : null,
              zatcaQrCode: zatcaMeta ? zatcaMeta.zatcaQrCode : null
            };
          });
          setCache(cacheKey, data);
          return data;
        })
        .catch(function (err) {
          console.warn('Supabase fetch failed, falling back to local cache', err);
          var cached = getCache(cacheKey);
          return cached || [];
        });
    } else {
      var cached = getCache(cacheKey);
      return Promise.resolve(cached || []);
    }
  }

  function saveCustomerInvoice(invoice, tenantSlug, bypassQueue) {
    var client = getClient();
    var cacheKey = 'mken_cache_invoices';
    var slug = tenantSlug || invoice.tenantSlug || 'default';

    var finalItems = (invoice.items || []).filter(function(x) { return x && !x.isZatcaMeta; });
    if (invoice.zatcaStatus) {
      finalItems.push({
        isZatcaMeta: true,
        zatcaStatus: invoice.zatcaStatus,
        zatcaUuid: invoice.zatcaUuid,
        zatcaXmlHash: invoice.zatcaXmlHash,
        zatcaQrCode: invoice.zatcaQrCode
      });
    }

    var localInvoice = {
      id: invoice.id,
      tenantSlug: slug,
      customerId: invoice.customerId || null,
      customerName: invoice.customerName,
      customerPhone: invoice.customerPhone || '',
      items: finalItems,
      subtotal: Number(invoice.subtotal || 0),
      taxAmount: Number(invoice.taxAmount || 0),
      discount: Number(invoice.discount || 0),
      totalAmount: Number(invoice.totalAmount || 0),
      paymentStatus: invoice.paymentStatus || 'unpaid',
      paymentMethod: invoice.paymentMethod || '',
      type: invoice.type || 'invoice',
      createdAt: invoice.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    updateLocalCacheArray(cacheKey, localInvoice);

    if (client && navigator.onLine && (bypassQueue || getSyncQueue().length === 0)) {
      return client
        .from('mken_invoices')
        .upsert({
          id: invoice.id,
          tenant_slug: slug,
          customer_id: invoice.customerId || null,
          customer_name: invoice.customerName,
          customer_phone: invoice.customerPhone || null,
          items: finalItems,
          subtotal: Number(invoice.subtotal || 0),
          tax_amount: Number(invoice.taxAmount || 0),
          discount: Number(invoice.discount || 0),
          total_amount: Number(invoice.totalAmount || 0),
          payment_status: invoice.paymentStatus || 'unpaid',
          payment_method: invoice.paymentMethod || null,
          type: invoice.type || 'invoice',
          created_at: invoice.createdAt || new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .then(function (res) {
          if (res.error) throw res.error;
          return invoice;
        })
        .catch(function (err) {
          if (bypassQueue) throw err;
          console.warn('Supabase save failed, adding to sync queue', err);
          addToSyncQueue('saveCustomerInvoice', invoice, slug);
          if (window.MkenAdminToast) {
            window.MkenAdminToast('تم حفظ الفاتورة محلياً وسيتم مزامنتها عند توفر الاتصال');
          }
          return invoice;
        });
    } else {
      if (!bypassQueue) {
        addToSyncQueue('saveCustomerInvoice', invoice, slug);
        if (window.MkenAdminToast) {
          window.MkenAdminToast('تم حفظ الفاتورة محلياً وسيتم مزامنته عند توفر الاتصال');
        }
      }
      return Promise.resolve(invoice);
    }
  }

  function deleteCustomerInvoice(id) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Supabase not configured'));

    return client
      .from('mken_invoices')
      .delete()
      .eq('id', id)
      .then(function (res) {
        if (res.error) throw res.error;
        return id;
      });
  }

  function fetchVendors(tenantSlug) {
    var client = getClient();
    var cacheKey = 'mken_cache_vendors';
    var slug = tenantSlug || 'default';

    if (client && navigator.onLine) {
      return client
        .from('mken_vendors')
        .select('*')
        .eq('tenant_slug', slug)
        .order('name', { ascending: true })
        .then(function (res) {
          if (res.error) throw res.error;
          var data = (res.data || []).map(function (row) {
            return {
              id: row.id,
              tenantSlug: row.tenant_slug,
              name: row.name,
              contactPerson: row.contact_person || '',
              phone: row.phone || '',
              email: row.email || '',
              address: row.address || '',
              createdAt: row.created_at
            };
          });
          setCache(cacheKey, data);
          return data;
        })
        .catch(function (err) {
          console.warn('Supabase fetch failed, falling back to local cache', err);
          var cached = getCache(cacheKey);
          return cached || [];
        });
    } else {
      var cached = getCache(cacheKey);
      return Promise.resolve(cached || []);
    }
  }

  function saveVendor(vendor, tenantSlug, bypassQueue) {
    var client = getClient();
    var cacheKey = 'mken_cache_vendors';
    var slug = tenantSlug || vendor.tenantSlug || 'default';

    var localVendor = {
      id: vendor.id,
      tenantSlug: slug,
      name: vendor.name,
      contactPerson: vendor.contactPerson || '',
      phone: vendor.phone || '',
      email: vendor.email || '',
      address: vendor.address || '',
      createdAt: vendor.createdAt || new Date().toISOString()
    };
    updateLocalCacheArray(cacheKey, localVendor);

    if (client && navigator.onLine && (bypassQueue || getSyncQueue().length === 0)) {
      return client
        .from('mken_vendors')
        .upsert({
          id: vendor.id,
          tenant_slug: slug,
          name: vendor.name,
          contact_person: vendor.contactPerson || null,
          phone: vendor.phone || null,
          email: vendor.email || null,
          address: vendor.address || null,
          created_at: vendor.createdAt || new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .then(function (res) {
          if (res.error) throw res.error;
          return vendor;
        })
        .catch(function (err) {
          if (bypassQueue) throw err;
          console.warn('Supabase save failed, adding to sync queue', err);
          addToSyncQueue('saveVendor', vendor, slug);
          if (window.MkenAdminToast) {
            window.MkenAdminToast('تم حفظ المورد محلياً وسيتم مزامنته عند توفر الاتصال');
          }
          return vendor;
        });
    } else {
      if (!bypassQueue) {
        addToSyncQueue('saveVendor', vendor, slug);
        if (window.MkenAdminToast) {
          window.MkenAdminToast('تم حفظ المورد محلياً وسيتم مزامنته عند توفر الاتصال');
        }
      }
      return Promise.resolve(vendor);
    }
  }

  function deleteVendor(id) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Supabase not configured'));

    return client
      .from('mken_vendors')
      .delete()
      .eq('id', id)
      .then(function (res) {
        if (res.error) throw res.error;
        return id;
      });
  }

  function fetchCustomers(tenantSlug) {
    var client = getClient();
    var cacheKey = 'mken_cache_customers';
    var slug = tenantSlug || 'default';

    if (client && navigator.onLine) {
      return client
        .from('mken_customers')
        .select('*')
        .eq('tenant_slug', slug)
        .order('name', { ascending: true })
        .then(function (res) {
          if (res.error) throw res.error;
          var data = (res.data || []).map(function (row) {
            return {
              id: row.id,
              tenantSlug: row.tenant_slug,
              name: row.name,
              phone: row.phone || '',
              email: row.email || '',
              address: row.address || '',
              createdAt: row.created_at
            };
          });
          setCache(cacheKey, data);
          return data;
        })
        .catch(function (err) {
          console.warn('Supabase fetch failed, falling back to local cache', err);
          var cached = getCache(cacheKey);
          return cached || [];
        });
    } else {
      var cached = getCache(cacheKey);
      return Promise.resolve(cached || []);
    }
  }

  function saveCustomer(customer, tenantSlug, bypassQueue) {
    var client = getClient();
    var cacheKey = 'mken_cache_customers';
    var slug = tenantSlug || customer.tenantSlug || 'default';

    var localCustomer = {
      id: customer.id,
      tenantSlug: slug,
      name: customer.name,
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
      createdAt: customer.createdAt || new Date().toISOString()
    };
    updateLocalCacheArray(cacheKey, localCustomer);

    if (client && navigator.onLine && (bypassQueue || getSyncQueue().length === 0)) {
      return client
        .from('mken_customers')
        .upsert({
          id: customer.id,
          tenant_slug: slug,
          name: customer.name,
          phone: customer.phone || null,
          email: customer.email || null,
          address: customer.address || null,
          created_at: customer.createdAt || new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .then(function (res) {
          if (res.error) throw res.error;
          return customer;
        })
        .catch(function (err) {
          if (bypassQueue) throw err;
          console.warn('Supabase save failed, adding to sync queue', err);
          addToSyncQueue('saveCustomer', customer, slug);
          if (window.MkenAdminToast) {
            window.MkenAdminToast('تم حفظ العميل محلياً وسيتم مزامنته عند توفر الاتصال');
          }
          return customer;
        });
    } else {
      if (!bypassQueue) {
        addToSyncQueue('saveCustomer', customer, slug);
        if (window.MkenAdminToast) {
          window.MkenAdminToast('تم حفظ العميل محلياً وسيتم مزامنته عند توفر الاتصال');
        }
      }
      return Promise.resolve(customer);
    }
  }

  function deleteCustomer(id) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Supabase not configured'));

    return client
      .from('mken_customers')
      .delete()
      .eq('id', id)
      .then(function (res) {
        if (res.error) throw res.error;
        return id;
      });
  }

  function fetchPurchaseInvoices(tenantSlug) {
    var client = getClient();
    var cacheKey = 'mken_cache_purchase_invoices';
    var slug = tenantSlug || 'default';

    if (client && navigator.onLine) {
      return client
        .from('mken_purchase_invoices')
        .select('*')
        .eq('tenant_slug', slug)
        .order('created_at', { ascending: false })
        .then(function (res) {
          if (res.error) throw res.error;
          var data = (res.data || []).map(function (row) {
            return {
              id: row.id,
              tenantSlug: row.tenant_slug,
              vendorId: row.vendor_id,
              items: row.items || [],
              totalAmount: Number(row.total_amount || 0),
              paymentStatus: row.payment_status || 'unpaid',
              createdAt: row.created_at
            };
          });
          setCache(cacheKey, data);
          return data;
        })
        .catch(function (err) {
          console.warn('Supabase fetch failed, falling back to local cache', err);
          var cached = getCache(cacheKey);
          return cached || [];
        });
    } else {
      var cached = getCache(cacheKey);
      return Promise.resolve(cached || []);
    }
  }

  function savePurchaseInvoice(invoice, tenantSlug, bypassQueue) {
    var client = getClient();
    var cacheKey = 'mken_cache_purchase_invoices';
    var slug = tenantSlug || invoice.tenantSlug || 'default';

    var localInvoice = {
      id: invoice.id,
      tenantSlug: slug,
      vendorId: invoice.vendorId || null,
      items: invoice.items || [],
      totalAmount: Number(invoice.totalAmount || 0),
      paymentStatus: invoice.paymentStatus || 'unpaid',
      createdAt: invoice.createdAt || new Date().toISOString()
    };
    updateLocalCacheArray(cacheKey, localInvoice);

    if (client && navigator.onLine && (bypassQueue || getSyncQueue().length === 0)) {
      return client
        .from('mken_purchase_invoices')
        .upsert({
          id: invoice.id,
          tenant_slug: slug,
          vendor_id: invoice.vendorId || null,
          items: invoice.items || [],
          total_amount: Number(invoice.totalAmount || 0),
          payment_status: invoice.paymentStatus || 'unpaid',
          created_at: invoice.createdAt || new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .then(function (res) {
          if (res.error) throw res.error;
          return invoice;
        })
        .catch(function (err) {
          if (bypassQueue) throw err;
          console.warn('Supabase save failed, adding to sync queue', err);
          addToSyncQueue('savePurchaseInvoice', invoice, slug);
          if (window.MkenAdminToast) {
            window.MkenAdminToast('تم حفظ الفاتورة محلياً وسيتم مزامنته عند توفر الاتصال');
          }
          return invoice;
        });
    } else {
      if (!bypassQueue) {
        addToSyncQueue('savePurchaseInvoice', invoice, slug);
        if (window.MkenAdminToast) {
          window.MkenAdminToast('تم حفظ الفاتورة محلياً وسيتم مزامنته عند توفر الاتصال');
        }
      }
      return Promise.resolve(invoice);
    }
  }

  function deletePurchaseInvoice(id) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Supabase not configured'));

    return client
      .from('mken_purchase_invoices')
      .delete()
      .eq('id', id)
      .then(function (res) {
        if (res.error) throw res.error;
        return id;
      });
  }

  function fetchInventoryTransactions(tenantSlug) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Supabase not configured'));

    var slug = tenantSlug || 'default';
    return client
      .from('mken_inventory_transactions')
      .select('*')
      .eq('tenant_slug', slug)
      .order('created_at', { ascending: false })
      .then(function (res) {
        if (res.error) throw res.error;
        return (res.data || []).map(function (row) {
          return {
            id: row.id,
            tenantSlug: row.tenant_slug,
            itemId: row.item_id,
            type: row.type,
            quantity: Number(row.quantity || 0),
            referenceId: row.reference_id || '',
            notes: row.notes || '',
            createdAt: row.created_at
          };
        });
      });
  }

  function testConnection(url, key) {
    if (!window.supabase) return Promise.reject(new Error('مكتبة Supabase غير محملة على هذا المتصفح.'));
    try {
      var tempClient = window.supabase.createClient(url, key);
      return tempClient
        .from('mken_saas_clients')
        .select('id')
        .limit(1)
        .then(function (res) {
          if (res.error) {
            // Check old table
            return tempClient
              .from('mken_config')
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
      'CREATE TABLE IF NOT EXISTS mken_saas_clients (',
      '    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),',
      '    tenant_slug TEXT UNIQUE NOT NULL,',
      '    owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,',
      '    business_name TEXT NOT NULL,',
      '    email TEXT UNIQUE NOT NULL,',
      '    phone TEXT NOT NULL,',
      '    subscription_status TEXT DEFAULT \'active\',',
      '    subscription_tier TEXT DEFAULT \'basic\',',
      '    subscription_start TIMESTAMPTZ DEFAULT NOW(),',
      '    subscription_end TIMESTAMPTZ NOT NULL,',
      '    config_data JSONB NOT NULL,',
      '    saved_config_data JSONB,',
      '    reminders_sent JSONB DEFAULT \'[]\'::jsonb,',
      '    google_access_token TEXT,',
      '    google_refresh_token TEXT,',
      '    google_token_expiry TIMESTAMPTZ,',
      '    google_business_location_id TEXT,',
      '    created_at TIMESTAMPTZ DEFAULT NOW(),',
      '    updated_at TIMESTAMPTZ DEFAULT NOW()',
      ');',
      '',
      '-- 2. إنشاء جدول المواعيد وتطويره لدعم المستأجرين',
      'CREATE TABLE IF NOT EXISTS mken_appointments (',
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
      'CREATE TABLE IF NOT EXISTS mken_orders (',
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
      '-- 4. إنشاء جدول الموظفين/الفنيين mken_staff',
      'CREATE TABLE IF NOT EXISTS mken_staff (',
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
      'ALTER TABLE mken_appointments ADD COLUMN IF NOT EXISTS staff_id TEXT REFERENCES mken_staff(id) ON DELETE SET NULL;',
      '',
      '-- 6. إنشاء جدول الأجهزة والتوثيق الحيوي للفنيين mken_staff_devices',
      'CREATE TABLE IF NOT EXISTS mken_staff_devices (',
      '    id TEXT PRIMARY KEY,',
      '    staff_id TEXT NOT NULL REFERENCES mken_staff(id) ON DELETE CASCADE,',
      '    device_name TEXT NOT NULL,',
      '    credential_id TEXT UNIQUE NOT NULL,',
      '    public_key TEXT NOT NULL,',
      '    counter INTEGER DEFAULT 0,',
      '    created_at TIMESTAMPTZ DEFAULT NOW()',
      ');',
      '',
      '-- 7. إنشاء جدول الفواتير لـ SaaS mken_saas_invoices',
      'CREATE TABLE IF NOT EXISTS mken_saas_invoices (',
      '    id TEXT PRIMARY KEY,',
      '    tenant_slug TEXT NOT NULL REFERENCES mken_saas_clients(tenant_slug) ON DELETE CASCADE,',
      '    amount NUMERIC NOT NULL,',
      '    months INTEGER NOT NULL,',
      '    status TEXT DEFAULT \'unpaid\',',
      '    payment_id TEXT,',
      '    payment_method TEXT,',
      '    created_at TIMESTAMPTZ DEFAULT NOW(),',
      '    updated_at TIMESTAMPTZ DEFAULT NOW()',
      ');',
      '',
      '-- 7b. إنشاء جدول أصناف المستودع والمخزون mken_inventory_items',
      'CREATE TABLE IF NOT EXISTS mken_inventory_items (',
      '    id TEXT PRIMARY KEY,',
      '    tenant_slug TEXT NOT NULL REFERENCES mken_saas_clients(tenant_slug) ON DELETE CASCADE,',
      '    name TEXT NOT NULL,',
      '    sku TEXT,',
      '    barcode TEXT,',
      '    cost_price NUMERIC DEFAULT 0,',
      '    sell_price NUMERIC DEFAULT 0,',
      '    quantity INTEGER DEFAULT 0,',
      '    min_stock_alert INTEGER DEFAULT 0,',
      '    image_url TEXT,',
      '    created_at TIMESTAMPTZ DEFAULT NOW(),',
      '    updated_at TIMESTAMPTZ DEFAULT NOW()',
      ');',
      '',
      '-- 7c. إنشاء جدول فواتير العملاء mken_invoices',
      'CREATE TABLE IF NOT EXISTS mken_invoices (',
      '    id TEXT PRIMARY KEY,',
      '    tenant_slug TEXT NOT NULL REFERENCES mken_saas_clients(tenant_slug) ON DELETE CASCADE,',
      '    customer_name TEXT NOT NULL,',
      '    customer_phone TEXT,',
      '    items JSONB DEFAULT \'[]\'::jsonb,',
      '    subtotal NUMERIC DEFAULT 0,',
      '    tax_amount NUMERIC DEFAULT 0,',
      '    discount NUMERIC DEFAULT 0,',
      '    total_amount NUMERIC DEFAULT 0,',
      '    payment_status TEXT DEFAULT \'unpaid\',',
      '    payment_method TEXT,',
      '    type TEXT DEFAULT \'invoice\',',
      '    created_at TIMESTAMPTZ DEFAULT NOW(),',
      '    updated_at TIMESTAMPTZ DEFAULT NOW()',
      ');',
      '',
      '-- 7d. إنشاء جدول حركات المخزون mken_inventory_transactions',
      'CREATE TABLE IF NOT EXISTS mken_inventory_transactions (',
      '    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),',
      '    tenant_slug TEXT NOT NULL REFERENCES mken_saas_clients(tenant_slug) ON DELETE CASCADE,',
      '    item_id TEXT REFERENCES mken_inventory_items(id) ON DELETE CASCADE,',
      '    type TEXT NOT NULL,',
      '    quantity INTEGER NOT NULL,',
      '    reference_id TEXT,',
      '    notes TEXT,',
      '    created_at TIMESTAMPTZ DEFAULT NOW()',
      ');',
      '',
      '-- 7e. إنشاء جدول الموردين mken_vendors',
      'CREATE TABLE IF NOT EXISTS mken_vendors (',
      '    id TEXT PRIMARY KEY,',
      '    tenant_slug TEXT NOT NULL REFERENCES mken_saas_clients(tenant_slug) ON DELETE CASCADE,',
      '    name TEXT NOT NULL,',
      '    contact_person TEXT,',
      '    phone TEXT,',
      '    email TEXT,',
      '    address TEXT,',
      '    created_at TIMESTAMPTZ DEFAULT NOW(),',
      '    updated_at TIMESTAMPTZ DEFAULT NOW()',
      ');',
      '',
      '-- 7f. إنشاء جدول فواتير المشتريات من الموردين mken_purchase_invoices',
      'CREATE TABLE IF NOT EXISTS mken_purchase_invoices (',
      '    id TEXT PRIMARY KEY,',
      '    tenant_slug TEXT NOT NULL REFERENCES mken_saas_clients(tenant_slug) ON DELETE CASCADE,',
      '    vendor_id TEXT REFERENCES mken_vendors(id) ON DELETE SET NULL,',
      '    items JSONB DEFAULT \'[]\'::jsonb,',
      '    total_amount NUMERIC DEFAULT 0,',
      '    payment_status TEXT DEFAULT \'unpaid\',',
      '    created_at TIMESTAMPTZ DEFAULT NOW(),',
      '    updated_at TIMESTAMPTZ DEFAULT NOW()',
      ');',
      '',
      '-- 7g. إنشاء جدول العملاء mken_customers',
      'CREATE TABLE IF NOT EXISTS mken_customers (',
      '    id TEXT PRIMARY KEY,',
      '    tenant_slug TEXT NOT NULL REFERENCES mken_saas_clients(tenant_slug) ON DELETE CASCADE,',
      '    name TEXT NOT NULL,',
      '    phone TEXT,',
      '    email TEXT,',
      '    address TEXT,',
      '    created_at TIMESTAMPTZ DEFAULT NOW(),',
      '    updated_at TIMESTAMPTZ DEFAULT NOW()',
      ');',
      '',
      '-- ترقية جدول mken_invoices لإضافة customer_id',
      'ALTER TABLE mken_invoices ADD COLUMN IF NOT EXISTS customer_id TEXT REFERENCES mken_customers(id) ON DELETE SET NULL;',
      '',
      '-- 8. إنشاء جدول مفاتيح الـ API للتكامل الخارجي mken_api_keys',
      'CREATE TABLE IF NOT EXISTS mken_api_keys (',
      '    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),',
      '    tenant_slug TEXT NOT NULL REFERENCES mken_saas_clients(tenant_slug) ON DELETE CASCADE,',
      '    key_name TEXT NOT NULL,',
      '    api_key TEXT UNIQUE NOT NULL,',
      '    created_at TIMESTAMPTZ DEFAULT NOW(),',
      '    expires_at TIMESTAMPTZ',
      ');',
      '',
      '-- 8c. إنشاء جدول سجل الرسائل mken_whatsapp_logs',
      'CREATE TABLE IF NOT EXISTS mken_whatsapp_logs (',
      '    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),',
      '    tenant_slug TEXT NOT NULL REFERENCES mken_saas_clients(tenant_slug) ON DELETE CASCADE,',
      '    phone TEXT NOT NULL,',
      '    body TEXT NOT NULL,',
      '    provider TEXT NOT NULL,',
      '    status TEXT NOT NULL,',
      '    error_message TEXT,',
      '    event_type TEXT,',
      '    appointment_id TEXT,',
      '    created_at TIMESTAMPTZ DEFAULT NOW(),',
      '    retry_count INTEGER DEFAULT 0',
      ');',
      '',
      '-- 8d. اشتراكات Web Push mken_push_subscriptions',
      'CREATE TABLE IF NOT EXISTS mken_push_subscriptions (',
      '    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),',
      '    tenant_slug TEXT NOT NULL DEFAULT \'default\',',
      '    endpoint TEXT UNIQUE NOT NULL,',
      '    keys JSONB NOT NULL,',
      '    label TEXT DEFAULT \'admin\',',
      '    user_agent TEXT,',
      '    created_at TIMESTAMPTZ DEFAULT NOW(),',
      '    updated_at TIMESTAMPTZ DEFAULT NOW()',
      ');',
      'CREATE INDEX IF NOT EXISTS idx_mken_push_subs_tenant ON mken_push_subscriptions(tenant_slug);',
      '',
      '-- 8b. ترقية الجداول القديمة — إضافة أعمدة SaaS والدفع',
      'ALTER TABLE mken_appointments ADD COLUMN IF NOT EXISTS tenant_slug TEXT DEFAULT \'default\';',
      'UPDATE mken_appointments SET tenant_slug = \'default\' WHERE tenant_slug IS NULL;',
      'ALTER TABLE mken_appointments ADD COLUMN IF NOT EXISTS reminders_sent JSONB DEFAULT \'[]\'::jsonb;',
      'ALTER TABLE mken_appointments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();',
      'ALTER TABLE mken_appointments ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT \'unpaid\';',
      'ALTER TABLE mken_appointments ADD COLUMN IF NOT EXISTS payment_id TEXT;',
      'ALTER TABLE mken_appointments ADD COLUMN IF NOT EXISTS payment_method TEXT;',
      'ALTER TABLE mken_appointments ADD COLUMN IF NOT EXISTS payment_amount NUMERIC;',
      'ALTER TABLE mken_appointments ADD COLUMN IF NOT EXISTS stay_unit TEXT;',
      'ALTER TABLE mken_appointments ADD COLUMN IF NOT EXISTS stay_booking BOOLEAN DEFAULT false;',
      'ALTER TABLE mken_appointments ADD COLUMN IF NOT EXISTS check_out_time TEXT;',
      '-- ملاحظة: جدول mken_orders يُنشأ في القسم 3 أعلاه إن لم يكن موجوداً',
      'DO $$ BEGIN',
      '  IF to_regclass(\'public.mken_orders\') IS NOT NULL THEN',
      '    ALTER TABLE mken_orders ADD COLUMN IF NOT EXISTS tenant_slug TEXT DEFAULT \'default\';',
      '    UPDATE mken_orders SET tenant_slug = \'default\' WHERE tenant_slug IS NULL;',
      '    ALTER TABLE mken_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();',
      '    ALTER TABLE mken_orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT \'unpaid\';',
      '    ALTER TABLE mken_orders ADD COLUMN IF NOT EXISTS payment_id TEXT;',
      '    ALTER TABLE mken_orders ADD COLUMN IF NOT EXISTS payment_method TEXT;',
      '    ALTER TABLE mken_orders ADD COLUMN IF NOT EXISTS payment_amount NUMERIC;',
      '  END IF;',
      'END $$;',
      'DO $$ BEGIN',
      '  IF to_regclass(\'public.mken_saas_clients\') IS NOT NULL THEN',
      '    ALTER TABLE mken_saas_clients ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;',
      '    ALTER TABLE mken_saas_clients ADD COLUMN IF NOT EXISTS saved_config_data JSONB;',
      '    ALTER TABLE mken_saas_clients ADD COLUMN IF NOT EXISTS reminders_sent JSONB DEFAULT \'[]\'::jsonb;',
      '    ALTER TABLE mken_saas_clients ADD COLUMN IF NOT EXISTS google_access_token TEXT;',
      '    ALTER TABLE mken_saas_clients ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;',
      '    ALTER TABLE mken_saas_clients ADD COLUMN IF NOT EXISTS google_token_expiry TIMESTAMPTZ;',
      '    ALTER TABLE mken_saas_clients ADD COLUMN IF NOT EXISTS google_business_location_id TEXT;',
      '  END IF;',
      'END $$;',
      'DO $$ BEGIN',
      '  IF to_regclass(\'public.mken_invoices\') IS NOT NULL THEN',
      '    ALTER TABLE mken_invoices ADD COLUMN IF NOT EXISTS type TEXT DEFAULT \'invoice\';',
      '  END IF;',
      'END $$;',
      '',
      '-- 9. إدراج مستأجر افتراضي للتوافق الكامل',
      'INSERT INTO mken_saas_clients (tenant_slug, business_name, email, phone, subscription_end, config_data)',
      'VALUES (\'default\', \'المنصة الافتراضية\', \'default@mken.com\', \'966543530333\', NOW() + INTERVAL \'10 years\', \'{}\'::jsonb)',
      'ON CONFLICT (tenant_slug) DO NOTHING;',
      '',
      '-- 10. تفعيل الحماية والأمان (RLS)',
      'DROP POLICY IF EXISTS "Allow public read appointments" ON mken_appointments;',
      'DROP POLICY IF EXISTS "Allow public read orders" ON mken_orders;',
      'DROP POLICY IF EXISTS "Allow public read staff" ON mken_staff;',
      'DROP POLICY IF EXISTS "Allow public read staff devices" ON mken_staff_devices;',
      'DROP POLICY IF EXISTS "Allow public read on clients" ON mken_saas_clients;',
      'DROP POLICY IF EXISTS "Allow public insert on clients" ON mken_saas_clients;',
      'DROP POLICY IF EXISTS "Allow owner manage client" ON mken_saas_clients;',
      'DROP POLICY IF EXISTS "Allow public insert on appointments" ON mken_appointments;',
      'DROP POLICY IF EXISTS "Allow owner manage appointments" ON mken_appointments;',
      'DROP POLICY IF EXISTS "Allow public insert on orders" ON mken_orders;',
      'DROP POLICY IF EXISTS "Allow owner manage orders" ON mken_orders;',
      'DROP POLICY IF EXISTS "Allow owner manage staff" ON mken_staff;',
      'DROP POLICY IF EXISTS "Allow owner read invoices" ON mken_saas_invoices;',
      'DROP POLICY IF EXISTS "Allow owner manage api keys" ON mken_api_keys;',
      'DROP POLICY IF EXISTS "Allow owner manage whatsapp logs" ON mken_whatsapp_logs;',
      'DROP POLICY IF EXISTS "Allow owner manage inventory items" ON mken_inventory_items;',
      'DROP POLICY IF EXISTS "Allow public read inventory items" ON mken_inventory_items;',
      'DROP POLICY IF EXISTS "Allow owner manage invoices" ON mken_invoices;',
      'DROP POLICY IF EXISTS "Allow owner manage inventory transactions" ON mken_inventory_transactions;',
      'DROP POLICY IF EXISTS "Allow owner manage vendors" ON mken_vendors;',
      'DROP POLICY IF EXISTS "Allow owner manage purchase invoices" ON mken_purchase_invoices;',
      'DROP POLICY IF EXISTS "Allow owner manage customers" ON mken_customers;',
      'ALTER TABLE mken_saas_clients ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE mken_appointments ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE mken_orders ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE mken_staff ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE mken_staff_devices ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE mken_saas_invoices ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE mken_api_keys ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE mken_whatsapp_logs ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE mken_inventory_items ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE mken_invoices ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE mken_inventory_transactions ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE mken_vendors ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE mken_purchase_invoices ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE mken_customers ENABLE ROW LEVEL SECURITY;',
      '',
      '-- 11. سياسات الأمان لجدول العملاء mken_saas_clients',
      'CREATE POLICY "Allow public read on clients" ON mken_saas_clients FOR SELECT USING (true);',
      'CREATE POLICY "Allow public insert on clients" ON mken_saas_clients FOR INSERT WITH CHECK (true);',
      'CREATE POLICY "Allow owner manage client" ON mken_saas_clients FOR ALL TO authenticated ',
      '  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);',
      '',
      '-- 12. سياسات الأمان لجدول المواعيد mken_appointments',
      'CREATE POLICY "Allow public insert on appointments" ON mken_appointments FOR INSERT WITH CHECK (true);',
      'CREATE POLICY "Allow owner manage appointments" ON mken_appointments FOR ALL TO authenticated ',
      '  USING (auth.uid() = (SELECT owner_id FROM mken_saas_clients WHERE tenant_slug = mken_appointments.tenant_slug LIMIT 1));',
      '',
      '-- 13. سياسات الأمان لجدول الطلبات mken_orders',
      'CREATE POLICY "Allow public insert on orders" ON mken_orders FOR INSERT WITH CHECK (true);',
      'CREATE POLICY "Allow owner manage orders" ON mken_orders FOR ALL TO authenticated ',
      '  USING (auth.uid() = (SELECT owner_id FROM mken_saas_clients WHERE tenant_slug = mken_orders.tenant_slug LIMIT 1));',
      '',
      '-- 14. سياسات الأمان لجدول الموظفين mken_staff',
      'CREATE POLICY "Allow owner manage staff" ON mken_staff FOR ALL TO authenticated ',
      '  USING (auth.uid() = (SELECT owner_id FROM mken_saas_clients WHERE tenant_slug = mken_staff.tenant_slug LIMIT 1));',
      '',
      '-- 15. سياسات الأمان للفواتير mken_saas_invoices',
      'CREATE POLICY "Allow owner read invoices" ON mken_saas_invoices FOR SELECT TO authenticated ',
      '  USING (auth.uid() = (SELECT owner_id FROM mken_saas_clients WHERE tenant_slug = mken_saas_invoices.tenant_slug LIMIT 1));',
      '',
      '-- 16. سياسات الأمان لمفاتيح الـ API',
      'CREATE POLICY "Allow owner manage api keys" ON mken_api_keys FOR ALL TO authenticated ',
      '  USING (auth.uid() = (SELECT owner_id FROM mken_saas_clients WHERE tenant_slug = mken_api_keys.tenant_slug LIMIT 1));',
      '',
      '-- 16b. سياسات الأمان لسجل رسائل الواتساب',
      'CREATE POLICY "Allow owner manage whatsapp logs" ON mken_whatsapp_logs FOR ALL TO authenticated ',
      '  USING (auth.uid() = (SELECT owner_id FROM mken_saas_clients WHERE tenant_slug = mken_whatsapp_logs.tenant_slug LIMIT 1));',
      '',
      '-- 16c. سياسات الأمان للمخزون والمنتجات',
      'CREATE POLICY "Allow public read inventory items" ON mken_inventory_items FOR SELECT USING (true);',
      'CREATE POLICY "Allow owner manage inventory items" ON mken_inventory_items FOR ALL TO authenticated ',
      '  USING (auth.uid() = (SELECT owner_id FROM mken_saas_clients WHERE tenant_slug = mken_inventory_items.tenant_slug LIMIT 1));',
      '',
      '-- 16d. سياسات الأمان لفواتير العملاء',
      'CREATE POLICY "Allow owner manage invoices" ON mken_invoices FOR ALL TO authenticated ',
      '  USING (auth.uid() = (SELECT owner_id FROM mken_saas_clients WHERE tenant_slug = mken_invoices.tenant_slug LIMIT 1));',
      '',
      '-- 16e. سياسات الأمان لحركات المخزن',
      'CREATE POLICY "Allow owner manage inventory transactions" ON mken_inventory_transactions FOR ALL TO authenticated ',
      '  USING (auth.uid() = (SELECT owner_id FROM mken_saas_clients WHERE tenant_slug = mken_inventory_transactions.tenant_slug LIMIT 1));',
      '',
      '-- 16f. سياسات الأمان لجدول الموردين',
      'CREATE POLICY "Allow owner manage vendors" ON mken_vendors FOR ALL TO authenticated ',
      '  USING (auth.uid() = (SELECT owner_id FROM mken_saas_clients WHERE tenant_slug = mken_vendors.tenant_slug LIMIT 1));',
      '',
      '-- 16g. سياسات الأمان لفواتير المشتريات',
      'CREATE POLICY "Allow owner manage purchase invoices" ON mken_purchase_invoices FOR ALL TO authenticated ',
      '  USING (auth.uid() = (SELECT owner_id FROM mken_saas_clients WHERE tenant_slug = mken_purchase_invoices.tenant_slug LIMIT 1));',
      '',
      '-- 16h. سياسات الأمان لجدول العملاء',
      'CREATE POLICY "Allow owner manage customers" ON mken_customers FOR ALL TO authenticated ',
      '  USING (auth.uid() = (SELECT owner_id FROM mken_saas_clients WHERE tenant_slug = mken_customers.tenant_slug LIMIT 1));',
      '',
      '-- 17. إنشاء منظر عام للمواعيد لا يعرض معلومات حساسة',
      'CREATE OR REPLACE VIEW mken_public_appointments AS ',
      '  SELECT id, tenant_slug, activity_id, service_id, date, time, status FROM mken_appointments;',
      'GRANT SELECT ON mken_public_appointments TO anon;',
      'GRANT SELECT ON mken_public_appointments TO authenticated;',
      '',
      '-- 18. دالة التحقق من رمز PIN للموظفين بشكل آمن',
      'DROP FUNCTION IF EXISTS verify_staff_pin(text, text, text);',
      'CREATE OR REPLACE FUNCTION verify_staff_pin(p_tenant text, p_phone text, p_pin_hash text) ',
      'RETURNS jsonb SECURITY DEFINER AS $$',
      'DECLARE',
      '    v_staff record;',
      'BEGIN',
      '    SELECT id, name, role, phone, tenant_slug, status INTO v_staff ',
      '    FROM mken_staff ',
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
      'DROP FUNCTION IF EXISTS get_staff_appointments(text);',
      'CREATE OR REPLACE FUNCTION get_staff_appointments(p_staff_id text) ',
      'RETURNS SETOF mken_appointments SECURITY DEFINER AS $$',
      'BEGIN',
      '    RETURN QUERY SELECT * FROM mken_appointments WHERE staff_id = p_staff_id;',
      'END;',
      '$$ LANGUAGE plpgsql;',
      'GRANT EXECUTE ON FUNCTION get_staff_appointments(text) TO anon;',
      'GRANT EXECUTE ON FUNCTION get_staff_appointments(text) TO authenticated;',
      '',
      '-- 20. دالة تحديث حالة المهمة للفني بشكل آمن',
      'DROP FUNCTION IF EXISTS update_staff_appointment_status(text, text, text);',
      'CREATE OR REPLACE FUNCTION update_staff_appointment_status(p_appointment_id text, p_staff_id text, p_new_status text) ',
      'RETURNS jsonb SECURITY DEFINER AS $$',
      'BEGIN',
      '    UPDATE mken_appointments ',
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
      'GRANT EXECUTE ON FUNCTION update_staff_appointment_status(text, text, text) TO authenticated;',
      '',
      '-- 21. دالة خصم المخزون بشكل آمن للمتجر الإلكتروني',
      'DROP FUNCTION IF EXISTS deduct_inventory_stock(text, text, integer, text);',
      'CREATE OR REPLACE FUNCTION deduct_inventory_stock(p_tenant text, p_item_id text, p_quantity integer, p_reference_id text) ',
      'RETURNS jsonb SECURITY DEFINER AS $$',
      'DECLARE',
      '    v_current_qty integer;',
      'BEGIN',
      '    SELECT quantity INTO v_current_qty FROM mken_inventory_items WHERE tenant_slug = p_tenant AND id = p_item_id;',
      '    IF NOT FOUND THEN',
      '        RETURN jsonb_build_object(\'success\', false, \'error\', \'Product not found\');',
      '    END IF;',
      '    IF v_current_qty < p_quantity THEN',
      '        RETURN jsonb_build_object(\'success\', false, \'error\', \'Insufficient stock\');',
      '    END IF;',
      '    UPDATE mken_inventory_items ',
      '    SET quantity = quantity - p_quantity, updated_at = NOW() ',
      '    WHERE tenant_slug = p_tenant AND id = p_item_id;',
      '    INSERT INTO mken_inventory_transactions (tenant_slug, item_id, type, quantity, reference_id, notes) ',
      '    VALUES (p_tenant, p_item_id, \'stock-out\', p_quantity, p_reference_id, \'مبيعات متجر إلكتروني\');',
      '    RETURN jsonb_build_object(\'success\', true);',
      'END;',
      '$$ LANGUAGE plpgsql;',
      'GRANT EXECUTE ON FUNCTION deduct_inventory_stock(text, text, integer, text) TO anon;',
      'GRANT EXECUTE ON FUNCTION deduct_inventory_stock(text, text, integer, text) TO authenticated;',
      '',
      '-- 22. دالة زيادة المخزون تلقائياً وتحديث التكلفة عند الشراء من مورد',
      'DROP FUNCTION IF EXISTS add_inventory_stock(text, text, integer, numeric, text);',
      'CREATE OR REPLACE FUNCTION add_inventory_stock(p_tenant text, p_item_id text, p_quantity integer, p_cost_price numeric, p_reference_id text) ',
      'RETURNS jsonb SECURITY DEFINER AS $$',
      'BEGIN',
      '    UPDATE mken_inventory_items ',
      '    SET quantity = quantity + p_quantity, ',
      '        cost_price = p_cost_price, ',
      '        updated_at = NOW() ',
      '    WHERE tenant_slug = p_tenant AND id = p_item_id;',
      '    IF FOUND THEN',
      '        INSERT INTO mken_inventory_transactions (tenant_slug, item_id, type, quantity, reference_id, notes) ',
      '        VALUES (p_tenant, p_item_id, \'stock-in\', p_quantity, p_reference_id, \'فاتورة مشتريات من مورد\');',
      '        RETURN jsonb_build_object(\'success\', true);',
      '    ELSE',
      '        RETURN jsonb_build_object(\'success\', false, \'error\', \'Product not found\');',
      '    END IF;',
      'END;',
      '$$ LANGUAGE plpgsql;',
      'GRANT EXECUTE ON FUNCTION add_inventory_stock(text, text, integer, numeric, text) TO anon;',
      'GRANT EXECUTE ON FUNCTION add_inventory_stock(text, text, integer, numeric, text) TO authenticated;'
    ].join('\n');
  }

  window.MkenSupabaseDb = {
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
    fetchInventoryItems: fetchInventoryItems,
    saveInventoryItem: saveInventoryItem,
    deleteInventoryItem: deleteInventoryItem,
    fetchCustomerInvoices: fetchCustomerInvoices,
    saveCustomerInvoice: saveCustomerInvoice,
    deleteCustomerInvoice: deleteCustomerInvoice,
    fetchCustomers: fetchCustomers,
    saveCustomer: saveCustomer,
    deleteCustomer: deleteCustomer,
    fetchInventoryTransactions: fetchInventoryTransactions,
    fetchVendors: fetchVendors,
    saveVendor: saveVendor,
    deleteVendor: deleteVendor,
    fetchPurchaseInvoices: fetchPurchaseInvoices,
    savePurchaseInvoice: savePurchaseInvoice,
    deletePurchaseInvoice: deletePurchaseInvoice,
    fetchStaff: fetchStaff,
    saveStaff: saveStaff,
    deleteStaff: deleteStaff,
    fetchApiKeys: fetchApiKeys,
    saveApiKey: saveApiKey,
    deleteApiKey: deleteApiKey,
    fetchWhatsappLogs: fetchWhatsappLogs,
    logWhatsappMessage: logWhatsappMessage,
    deleteWhatsappLog: deleteWhatsappLog,
    testConnection: testConnection,
    getInitSql: getInitSql,
    getClient: getClient,
    getPendingSyncCount: getPendingSyncCount,
  };
})();
