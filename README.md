# Einkaufsliste

Familien-Einkaufslisten-PWA. Eine einzige `index.html` (Vanilla JS, kein Build), Sync über Supabase.

## Hosting

- **Statische Seite:** GitHub Pages (Branch `main`, Ordner `/root`) unter `https://ostelai.github.io/einkaufsliste/`.
- **Push-Benachrichtigungen:** `cloudflare-worker/notify.js`, deployed als Cloudflare Worker (ersetzt die frühere Netlify-Function — GitHub Pages kann keine Server-Funktionen ausführen). Der OneSignal-REST-Key liegt ausschließlich dort als verschlüsseltes Secret, nie im Client-Code.
- **Datenbank:** Supabase (Tabelle `einkaufsliste`), Zugangsdaten (Publishable/Anon-Key) sind bewusst im Client sichtbar, abgesichert über Row-Level-Security-Policy.

Frühere Version lief auf Netlify (manueller ZIP-Upload + Netlify Function als Proxy) — siehe `handoff-einkaufsliste.md` für die volle Feature-Historie und Architektur bis v3.4.5.

## Deployment-Workflow

1. `index.html` ändern, committen, pushen — GitHub Pages deployt automatisch.
2. Bei Änderungen an `cloudflare-worker/notify.js`: Code im Cloudflare-Dashboard (Worker → Quick Edit) aktualisieren und deployen (kein automatisches CI/CD an das Repo gekoppelt).

## Wichtig

- `NOTIFY_ENDPOINT` in `index.html` muss auf die tatsächliche Worker-URL zeigen (`https://<worker-name>.<dein-subdomain>.workers.dev`).
- Der Worker erlaubt CORS nur von `https://ostelai.github.io` — bei Domain-Wechsel in `cloudflare-worker/notify.js` (`ALLOWED_ORIGIN`) anpassen.
