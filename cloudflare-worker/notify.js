// Cloudflare Worker: ersetzt die frühere Netlify-Function (netlify/functions/notify.js).
// Nimmt vom Client { title, body, excludeSubId } entgegen und schickt darüber eine
// Push-Benachrichtigung über die OneSignal REST API — der REST-Key bleibt dabei
// ausschließlich hier serverseitig (als Cloudflare-Secret), nie im Client-Code.
//
// Benötigte Einstellungen im Cloudflare-Dashboard (Worker → Settings → Variables):
//   - ONESIGNAL_APP_ID   (Variable, unverschlüsselt)  z.B. 099b5ea0-4f66-472c-8de5-e708803c43be
//   - ONESIGNAL_REST_KEY (Secret, verschlüsselt)       aus OneSignal-Dashboard → Keys & IDs

const ALLOWED_ORIGIN = "https://ostelai.github.io";

// Supabase pausiert Projekte im Gratis-Tarif nach einigen Tagen ohne Zugriff und
// nimmt dabei die Adresse ganz vom Netz (DNS: "Non-existent domain"). Genau das ist
// am 15.10.2026 passiert: Speichern schlug fehl, Push-Nachrichten kamen aber weiter
// an — die App wirkte dadurch funktionsfähig. Der Cron-Trigger unten ruft die
// Datenbank täglich einmal auf, damit sie gar nicht erst einschläft.
// Schlüssel und Adresse stehen ohnehin öffentlich im Client (index.html), hier ist
// also kein Secret nötig.
const SB_URL = "https://bmqkwfzvgunymwonyhrn.supabase.co";
const SB_KEY = "sb_publishable_am-CKp7YAzXiN2t10pQXCA_DCG-eLF7";

async function weckeDatenbank() {
  const r = await fetch(
    `${SB_URL}/rest/v1/einkaufsliste?id=eq.main&select=id`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
  );
  console.log("Weckruf Supabase:", r.status, r.ok ? "ok" : await r.text());
  return r.ok;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data, status, extraHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(), ...(extraHeaders || {}) },
  });
}

async function sendToOneSignal(env, body) {
  return fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Key ${env.ONESIGNAL_REST_KEY}`,
    },
    body: JSON.stringify(body),
  });
}

export default {
  // Läuft nach dem Zeitplan aus den Cron-Triggern (Worker → Settings → Triggers).
  async scheduled(event, env, ctx) {
    ctx.waitUntil(weckeDatenbank());
  },

  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }
    // Zum Testen von Hand: .../?weckruf im Browser aufrufen. Zeigt sofort, ob die
    // Datenbank erreichbar ist — ohne auf den nächsten Cron-Lauf zu warten.
    if (request.method === "GET" && new URL(request.url).searchParams.has("weckruf")) {
      const ok = await weckeDatenbank();
      return json({ weckruf: ok ? "Datenbank ist wach" : "Datenbank antwortet nicht" }, ok ? 200 : 503);
    }
    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const { title, body, excludeSubId } = payload || {};
    if (!title || !body) {
      return json({ error: "title und body sind erforderlich" }, 400);
    }

    // "Total Subscriptions" ist der Name der Alle-Geräte-Gruppe in aktuellen
    // OneSignal-Apps. Ältere Apps hießen an dieser Stelle "Subscribed Users" —
    // deshalb unten ein Fallback, falls die Gruppe mal nicht existiert
    // (sonst kommt die Nachricht kommentarlos bei niemandem an).
    const SEGMENTS = ["Total Subscriptions", "Subscribed Users"];

    function buildBody(segment, withExclude) {
      const b = {
        app_id: env.ONESIGNAL_APP_ID,
        included_segments: [segment],
        headings: { en: String(title) },
        contents: { en: String(body) },
      };
      if (withExclude && excludeSubId) b.excluded_player_ids = [excludeSubId];
      return b;
    }

    function failed(res, data) {
      return !res.ok || (Array.isArray(data.errors) && data.errors.length > 0);
    }

    let res, data;
    for (const segment of SEGMENTS) {
      // Erst mit Ausschluss des Absenders …
      res = await sendToOneSignal(env, buildBody(segment, true));
      data = await res.json();

      // … falls die Ausschluss-ID nicht akzeptiert wird, lieber an alle senden
      // (inkl. Absender) als die Benachrichtigung ganz zu verlieren.
      if (failed(res, data) && excludeSubId) {
        res = await sendToOneSignal(env, buildBody(segment, false));
        data = await res.json();
      }

      if (!failed(res, data)) break;
    }

    return json(data, res.status);
  },
};
