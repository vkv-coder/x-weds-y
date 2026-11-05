// X weds Y - sends a Web Push "buzz" to every guest device
// subscribed, when the admin posts an announcement. Called directly by the
// admin panel right after wy_admin_post_announcement succeeds (not a cron
// job - there's no scheduled trigger here, this one is on-demand).
//
// Auth: the admin session token (same one from wy_admin_login) is passed
// in the body and re-checked here against wy_admin_sessions using the
// service role key, so this function can't be used to spam guests by
// anyone who doesn't already hold a valid admin session.

import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('WY_VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('WY_VAPID_PRIVATE_KEY')!;

webpush.setVapidDetails('mailto:info.anyapps@gmail.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

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

interface Subscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function getSubscriptions(): Promise<Subscription[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/wy_push_subscriptions?select=id,endpoint,p256dh,auth`, {
    headers: restHeaders(),
  });
  if (!res.ok) throw new Error(`fetch subscriptions failed: ${await res.text()}`);
  return res.json();
}

async function deleteSubscription(id: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/wy_push_subscriptions?id=eq.${id}`, {
    method: 'DELETE',
    headers: restHeaders(),
  });
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: CORS_HEADERS });

  let body: { p_token?: string; title?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return new Response('invalid json', { status: 400, headers: CORS_HEADERS });
  }

  const { p_token, title, message } = body;
  if (!p_token || !title || !message) {
    return new Response('missing p_token, title or message', { status: 400, headers: CORS_HEADERS });
  }
  if (!(await isValidAdminToken(p_token))) {
    return new Response('forbidden', { status: 403, headers: CORS_HEADERS });
  }

  const subs = await getSubscriptions();
  let sent = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title, body: message })
        );
        sent++;
      } catch (e) {
        const statusCode = (e as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await deleteSubscription(sub.id);
        }
      }
    })
  );

  return new Response(JSON.stringify({ total: subs.length, sent }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
});
