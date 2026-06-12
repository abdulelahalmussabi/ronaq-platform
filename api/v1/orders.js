const { createClient } = require('@supabase/supabase-js');

async function authenticateApiKey(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header. Expected Bearer token.' });
    return null;
  }
  
  const apiKey = authHeader.substring(7).trim();
  if (!apiKey) {
    res.status(401).json({ error: 'Empty API key.' });
    return null;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    res.status(500).json({ error: 'Supabase URL or key not configured in environment.' });
    return null;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  // Find key in ronaq_api_keys
  const { data, error } = await supabase
    .from('ronaq_api_keys')
    .select('tenant_slug, expires_at')
    .eq('api_key', apiKey)
    .maybeSingle();

  if (error || !data) {
    console.warn('[API Auth] Key verification failed:', error ? error.message : 'Key not found');
    res.status(401).json({ error: 'Invalid API key.' });
    return null;
  }

  // Check expiration
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    res.status(401).json({ error: 'API key has expired.' });
    return null;
  }

  return { supabase, tenantSlug: data.tenant_slug };
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

module.exports = async function handler(req, res) {
  // CORS support
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const auth = await authenticateApiKey(req, res);
  if (!auth) return; // Response is already sent by authenticateApiKey

  const { supabase, tenantSlug } = auth;

  try {
    if (req.method === 'GET') {
      const { id, phone } = req.query;
      let query = supabase
        .from('ronaq_orders')
        .select('*')
        .eq('tenant_slug', tenantSlug);

      if (id) {
        query = query.eq('id', id);
      }
      if (phone) {
        query = query.eq('phone', phone);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;

      if (id && data.length === 0) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const orders = data.map(mapRowToOrder);
      return res.status(200).json(id ? orders[0] : orders);

    } else if (req.method === 'POST') {
      const body = req.body || {};
      
      const activityId = body.activityId || body.activity_id;
      const customerName = body.customerName || body.customer_name;
      const phone = body.phone;
      const items = body.items || [];

      if (!activityId || !customerName || !phone) {
        return res.status(400).json({
          error: 'Missing required fields. Required: activityId, customerName, phone'
        });
      }

      const orderId = body.id || 'ord_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
      
      const newRow = {
        id: orderId,
        tenant_slug: tenantSlug,
        activity_id: activityId,
        activity_title: body.activityTitle || body.activity_title || '',
        items: items,
        customer_name: customerName,
        phone: phone,
        district: body.district || null,
        location_address: body.locationAddress || body.location_address || null,
        notes: body.notes || null,
        status: body.status || 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        payment_status: body.paymentStatus || body.payment_status || 'unpaid',
        payment_id: body.paymentId || body.payment_id || null,
        payment_method: body.paymentMethod || body.payment_method || null,
        payment_amount: body.paymentAmount || body.payment_amount || null
      };

      const { data, error } = await supabase
        .from('ronaq_orders')
        .insert(newRow)
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json(mapRowToOrder(data));

    } else if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = req.body || {};
      const { id } = req.query;
      const orderId = id || body.id;

      if (!orderId) {
        return res.status(400).json({ error: 'Missing order ID' });
      }

      // Check existence and tenant ownership
      const { data: existing, error: findError } = await supabase
        .from('ronaq_orders')
        .select('id')
        .eq('id', orderId)
        .eq('tenant_slug', tenantSlug)
        .maybeSingle();

      if (findError) throw findError;
      if (!existing) {
        return res.status(404).json({ error: 'Order not found under this tenant' });
      }

      // Prepare updates
      const updates = {
        updated_at: new Date().toISOString()
      };

      // Extract and map all supported fields if they are defined
      const mapField = (camel, snake) => {
        if (body[camel] !== undefined) updates[snake] = body[camel];
        else if (body[snake] !== undefined) updates[snake] = body[snake];
      };

      mapField('activityId', 'activity_id');
      mapField('activityTitle', 'activity_title');
      mapField('items', 'items');
      mapField('customerName', 'customer_name');
      mapField('phone', 'phone');
      mapField('district', 'district');
      mapField('locationAddress', 'location_address');
      mapField('notes', 'notes');
      mapField('status', 'status');
      mapField('paymentStatus', 'payment_status');
      mapField('paymentId', 'payment_id');
      mapField('paymentMethod', 'payment_method');
      mapField('paymentAmount', 'payment_amount');

      const { data, error } = await supabase
        .from('ronaq_orders')
        .update(updates)
        .eq('id', orderId)
        .eq('tenant_slug', tenantSlug)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json(mapRowToOrder(data));

    } else if (req.method === 'DELETE') {
      const { id } = req.query;
      const body = req.body || {};
      const orderId = id || body.id;

      if (!orderId) {
        return res.status(400).json({ error: 'Missing order ID' });
      }

      // Check existence and tenant ownership
      const { data: existing, error: findError } = await supabase
        .from('ronaq_orders')
        .select('id')
        .eq('id', orderId)
        .eq('tenant_slug', tenantSlug)
        .maybeSingle();

      if (findError) throw findError;
      if (!existing) {
        return res.status(404).json({ error: 'Order not found under this tenant' });
      }

      const { error } = await supabase
        .from('ronaq_orders')
        .delete()
        .eq('id', orderId)
        .eq('tenant_slug', tenantSlug);

      if (error) throw error;
      return res.status(200).json({ success: true, deletedId: orderId });

    } else {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }
  } catch (err) {
    console.error('API Orders Error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
};
