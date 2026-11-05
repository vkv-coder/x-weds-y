// X weds Y - admin-only gallery photo deletion.
// Guests can only INSERT into the wy-gallery storage bucket (open upload,
// by design - any guest can add photos, everyone sees them). Deletion is
// deliberately NOT exposed via a storage RLS policy (that would let any
// guest delete anyone else's photo); it goes through this service-role
// function instead, gated by the admin session token.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function restHeaders() {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function isValidAdminToken(token: string): Promise<boolean> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/wy_admin_sessions?token=eq.${token}&expires_at=gt.${new Date().toISOString()}&select=token`,
    { headers: restHeaders() }
  );
  if (!res.ok) return false;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: CORS_HEADERS });

  let body: { p_token?: string; p_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response('invalid json', { status: 400, headers: CORS_HEADERS });
  }

  const { p_token, p_id } = body;
  if (!p_token || !p_id) return new Response('missing p_token or p_id', { status: 400, headers: CORS_HEADERS });
  if (!(await isValidAdminToken(p_token))) return new Response('forbidden', { status: 403, headers: CORS_HEADERS });

  // Fetch + delete the DB row first, so we know the storage path.
  const getRes = await fetch(`${SUPABASE_URL}/rest/v1/wy_gallery_photos?id=eq.${p_id}&select=storage_path`, {
    headers: restHeaders(),
  });
  const rows = await getRes.json();
  if (!Array.isArray(rows) || rows.length === 0) return new Response('not found', { status: 404, headers: CORS_HEADERS });
  const storagePath = rows[0].storage_path as string;

  await fetch(`${SUPABASE_URL}/rest/v1/wy_gallery_photos?id=eq.${p_id}`, {
    method: 'DELETE',
    headers: restHeaders(),
  });

  await fetch(`${SUPABASE_URL}/storage/v1/object/wy-gallery/${storagePath}`, {
    method: 'DELETE',
    headers: restHeaders(),
  });

  return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
});
