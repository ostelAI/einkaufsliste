# Einkaufsliste

Gemeinsame Familien-Einkaufsliste als installierbare Web-App (PWA). Ersetzt Zettel und
WhatsApp-Nachrichten: Jeder trägt ein, was fehlt, alle sehen dieselbe Liste, und beim
Einkaufen wird abgehakt.

Nutzer sind Christian (Papa), Mama, Oskar und Amy — **nicht technisch**. Christian testet
auf dem iPhone, diktiert oft (gelegentliche Tippfehler einkalkulieren). Änderungen knapp
und mit klarer Handlungsanweisung zusammenfassen, keine Fachbegriffe.

## Architektur

- **Eine einzige `index.html`** — Vanilla JS, inline CSS, kein Framework, kein Build-Schritt.
- **Hosting: GitHub Pages**, Repo `ostelAI/einkaufsliste`, Branch `main`, Ordner `/root`.
  Erreichbar unter `https://ostelai.github.io/einkaufsliste/` — **wichtig: Unterordner**, nicht
  Wurzelverzeichnis (siehe Fallstricke).
- **Daten: Supabase**, Tabelle `einkaufsliste`, eine einzige Zeile mit `id="main"`, Spalte
  `data` (JSONB). Der Schlüssel im Code ist ein *publishable* Key, Absicherung über
  Row-Level-Security. Bewusst so — die App hat keine Anmeldung.
- **Push-Nachrichten: OneSignal**, angesprochen über einen **Cloudflare Worker** als Proxy
  (`cloudflare-worker/notify.js`). GitHub Pages kann keine Server-Funktionen ausführen.
  Der OneSignal-REST-Key liegt **ausschließlich** dort als verschlüsseltes Secret.

Früher lief die App auf Netlify (ZIP-Upload + Netlify Function). Die Historie bis v3.4.4
steht in `handoff-einkaufsliste.md`.

## Datenmodell

Alles hängt am Objekt `S`, das komplett synchronisiert wird:

```js
S = {
  cat: { s: [...], d: [...] },  // Katalog: Supermarkt (s) / Drogerie (d)
  list: [...],                   // aktuelle Einkaufsliste
  checked: {},                   // id -> bool, abgehakt beim Einkaufen
  verlauf: [...],                // Kaufhistorie (kein eigener Tab)
  userCats: { s: [], d: [] },    // eigene Unterkategorien
  bugReports: [...],             // Problemberichte (Käfer-Knopf)
  lastNotifiedVersion: "4.2.0",  // gegen doppelte Update-Meldungen
  updatedAt, updatedBy
}
```

Katalog-Artikel: `{ id, n, u, q, sc, icon, img }` · Listen-Eintrag: `{ id, n, u, qty, cat, subcat, by, byAv, byImg }`

**Bilder liegen nur am Katalog-Artikel**, nicht am Listen-Eintrag — die Anzeige holt sie
über `itemMedia()` notfalls von dort. Nicht wieder duplizieren, das verdoppelt die
Datenmenge.

**Sync:** Bei jeder Änderung wird der ganze Zustand gepusht (`push()` → `sbSave()`), alle
Geräte pollen alle 8 Sekunden und übernehmen die neuere Fassung (Last-Write-Wins über
`updatedAt`). Kein echtes Merge — bearbeiten zwei Personen innerhalb der 8 Sekunden
verschiedene Dinge, gewinnt der spätere Push.

**Nur lokal (bewusst geräte-spezifisch):** `einkauf_me` (Name + Avatar), `seen_version`,
`einkauf_v3` (Cache des Zustands).

## Fallstricke — bitte vor Änderungen lesen

Diese Punkte haben jeweils Stunden Fehlersuche gekostet:

**Service Worker im Unterordner.** OneSignal sucht `OneSignalSDKWorker.js` per Default im
Wurzelverzeichnis der Domain. Auf GitHub Pages liegt die App unter `/einkaufsliste/`, also
gibt es dort 404 → keine Registrierung → **kein Push-Abo möglich**, obwohl die
Browser-Erlaubnis erteilt wird (sieht nach Erfolg aus, kommt aber nie an). Es braucht
**alle drei** Angaben zusammen, einzeln wirkungslos:
```js
serviceWorkerOverrideForTypical: true,   // sonst verwirft das SDK die Angaben ("typical")
path: "/einkaufsliste/",                 // ohne path wird serviceWorkerPath ignoriert
serviceWorkerPath: "OneSignalSDKWorker.js",
serviceWorkerParam: { scope: "/einkaufsliste/" }
```

**Abo abschließen.** `Notifications.requestPermission()` holt nur die Browser-Erlaubnis.
Erst `User.PushSubscription.optIn()` erzeugt das tatsächliche Abo.

**Zielgruppe beim Senden** heißt in der aktuellen OneSignal-App `"Total Subscriptions"`
(nicht mehr `"Subscribed Users"`). Falscher Name → HTTP 200, aber
`{"errors":["All included players are not subscribed"]}` und keine Zustellung.

**Versionsvergleich.** `lastNotifiedVersion` nur überschreiben, wenn die eigene Version
**neuer** ist (`istNeuer()`), nie bei „ungleich". Sonst setzt ein Gerät mit alter Fassung
aus dem Cache den Merker zurück und es entsteht eine Endlosschleife wechselnder
Update-Meldungen.

**Dialoge.** Inhalt gehört in `#dlg-msg`, nur Knöpfe in `#dlg-btns` (letzteres ordnet
nebeneinander an). `openDlg()` setzt `dlg-msg` per `textContent` — für HTML direkt
`innerHTML` setzen. Öffnet man aus einem Dialog heraus einen zweiten (Icon-/Bildauswahl),
gehen die Eingaben verloren → vorher in eine Variable sichern (`draft`-Muster, siehe
`pickEditItemImage()`).

**Nicht gegen die Produktivdaten testen.** Steht eine Anmeldung im `localStorage`, startet
die App beim Laden **automatisch** und pusht — bevor man Stubs setzen kann. Vor lokalen
Tests `einkauf_me` entfernen oder `fetch` für POST blockieren.

**`sbSave()` prüft `r.ok`.** Ein abgelehnter Request wirft keine Exception; ohne diese
Prüfung gilt das Speichern fälschlich als erfolgreich und niemand sieht die Änderung.

## Konventionen

- **`VER` hochzählen** bei jeder inhaltlichen Änderung (Konstante am Anfang des Skripts,
  wird im Kopf angezeigt).
- **`CHANGELOG`-Eintrag** ergänzen, Schlüssel = Versionsnummer. Zeilen mit `#` am Anfang
  werden als Begrüßung/Schlusssatz hervorgehoben (ohne Haken). Text **für Laien**, kurz,
  ohne Fachbegriffe. Schlusssatz üblicherweise: „Fragen? Einfach Papa Bescheid geben."
  Achtung bei geraden Anführungszeichen im String — escapen (`\"`).
- Deployment: `index.html` committen und pushen, GitHub Pages veröffentlicht automatisch
  (dauert 1–3 Minuten, danach greift zusätzlich bis zu 10 Minuten Browser-Cache).
- **Änderungen am Cloudflare Worker** werden **nicht** automatisch mit deployt — dessen
  Code muss von Hand im Cloudflare-Dashboard eingefügt werden.
- Design: dunkles Marineblau (`#0f1630`), Akzent Magenta/Violett, Supermarkt violett,
  Drogerie cyan-blau. Artikel tragen die Farbe ihrer Kategorie.
- App-Icon ist als Base64 im `<head>` eingebettet — nicht versehentlich entfernen.

## Problemberichte

Der Käfer-Knopf 🐛 im Kopfbereich öffnet ein Textfeld. Der Bericht landet mit 22
automatisch erhobenen technischen Angaben in `S.bugReports`, wird über den Sync verteilt
und löst eine Push an die Familie aus. Papa sieht alle Berichte im selben Dialog und kann
sie als Textdatei weiterleiten.
