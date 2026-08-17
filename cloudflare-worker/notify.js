// Cloudflare Worker: ersetzt die frühere Netlify-Function (netlify/functions/notify.js).
// Nimmt vom Client { title, body, excludeSubId } entgegen und schickt darüber eine
// Push-Benachrichtigung über die OneSignal REST API — der REST-Key bleibt dabei
// ausschließlich hier serverseitig (als Cloudflare-Secret), nie im Client-Code.
//
// Benötigte Einstellungen im Cloudflare-Dashboard (Worker → Settings → Variables):
//   - ONESIGNAL_APP_ID   (Variable, unverschlüsselt)  z.B. 099b5ea0-4f66-472c-8de5-e708803c43be
//   - ONESIGNAL_REST_KEY (Secret, verschlüsselt)       aus OneSignal-Dashboard → Keys & IDs

const ALLOWED_ORIGIN = "https://ostelai.github.io";

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
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
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

    const notifBody = {
      app_id: env.ONESIGNAL_APP_ID,
      included_segments: ["Subscribed Users"],
      headings: { en: String(title) },
      contents: { en: String(body) },
    };
    if (excludeSubId) {
      notifBody.excluded_player_ids = [excludeSubId];
    }

    let res = await sendToOneSignal(env, notifBody);
    let data = await res.json();

    // Falls die Ausschluss-ID vom aktuellen OneSignal-Modell nicht akzeptiert wird,
    // lieber an alle senden (inkl. Absender) als die Benachrichtigung ganz zu verlieren.
    if (!res.ok && excludeSubId) {
      delete notifBody.excluded_player_ids;
      res = await sendToOneSignal(env, notifBody);
      data = await res.json();
    }

    return json(data, res.status);
  },
};
