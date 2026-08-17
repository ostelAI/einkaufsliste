# Projekt-Übergabe: „Einkaufsliste" PWA (Stand v3.4.4)

## Überblick
Familien-Einkaufslisten-App als Progressive Web App (PWA), installierbar auf iPhone/Android-Homescreen. Ziel: geteilte Einkaufsliste zwischen mehreren Familienmitgliedern mit Echtzeit-Sync und Push-Benachrichtigungen.

## Tech-Stack
- **Frontend:** Eine einzige `index.html`-Datei, Vanilla HTML/CSS/JavaScript, kein Framework, kein Build-Prozess.
- **Backend/Datenbank:** Supabase (Tabelle `einkaufsliste`, Spalten `id`, `data` (JSONB), `updated_at`). Row Level Security aktiv mit Policy „allow all".
- **Push-Benachrichtigungen:** OneSignal, über eine Netlify-Function als serverseitigen Proxy (wegen CORS).
- **Hosting:** Netlify, Deployment per ZIP-Upload (`*.netlify.app`-Adresse).

## Datei-/Ordnerstruktur (ZIP für Netlify-Upload)
```
index.html                     ← komplette App (HTML+CSS+JS in einer Datei)
OneSignalSDKWorker.js          ← Service Worker für Push
netlify.toml                   ← [functions] directory = "netlify/functions"
netlify/functions/notify.js    ← Proxy-Funktion, ruft OneSignal REST API auf
```

## Architektur / Datenmodell
Zentrales State-Objekt `S`, wird komplett nach Supabase synchronisiert:
```js
S = {
  cat: { s: [...], d: [...] },   // Artikel-Katalog: Supermarkt (s) / Drogerie (d)
  list: [...],                    // aktuell ausgewählte Artikel (die eigentliche Einkaufsliste)
  checked: {},                    // id -> bool, abgehakt beim Einkaufen
  verlauf: [...],                 // intern gespeicherte Kaufhistorie (kein eigener Tab mehr seit 3.4.1)
  updatedAt: 0,
  updatedBy: ""
}
```
Artikel-Objekt (Katalog, in `S.cat.s`/`S.cat.d`): `{ id, n (Name), u (Einheit), q (Standardmenge), sc (Unterkategorie-Key), icon, img }`
Listen-Eintrag (in `S.list`): `{ id, n, u, qty, cat, subcat, by, byAv, byImg, icon, img }`

**Sync-Modell:** Kompletter State wird bei jeder Änderung als JSON nach Supabase gepusht (`push()` → `sbSave()`). Alle Clients pollen alle 8 Sekunden (`POLL=8000`) und übernehmen die Remote-Version per **Last-Write-Wins** anhand `updatedAt`-Zeitstempel (`applyRemote()`), plus BroadcastChannel für sofortigen Sync innerhalb desselben Browsers.
⚠️ **Bekannte Einschränkung:** Kein echtes Merge — bearbeiten zwei Personen innerhalb des 8-Sekunden-Fensters unterschiedliche Dinge, gewinnt komplett, wer zuletzt speichert. Die andere Änderung geht verloren.

**Lokal (nicht synchronisiert, bewusst geräte-spezifisch):**
- `einkauf_me` (localStorage) — eigener Name + Avatar der Person auf diesem Gerät
- `seen_version` (localStorage) — ob die Person den Changelog der aktuellen Version schon gesehen hat
- `einkauf_v3` (localStorage) — lokaler Cache des kompletten `S`-States für schnellen Start

Kategorien: Supermarkt hat feste Unterkategorien (Obst, Gemüse, Fleisch & Fisch, Milchprodukte, Backwaren, Getränke, Tiefkühl, Sonstiges), Drogerie eine Basis-Unterkategorie „Allgemein". Zusätzlich können eigene Unterkategorien angelegt werden (Icon + Name, aus einer ~90 Icon-Palette oder — ab v3.4.3 — auch per Foto).

## Feature-Historie (Changelog bis v3.4.4)

### v3.4.1
- Supermarkt & Drogerie optisch deutlich hervorgehoben (eigene farbige Kategorie-Header)
- Verlauf-Tab entfernt — mehr Platz für Planen & Einkaufen (Verlauf wird weiter intern gespeichert, nur kein UI-Tab mehr)
- Drogerie unterstützt jetzt eigene Unterkategorien (vorher nur eine flache Liste)
- Fix: Icon einer neuen Kategorie sprang beim Auswählen zurück
- Eigene Kategorien können bearbeitet und gelöscht werden (nur selbst angelegte, nicht die Standard-Kategorien)
- „Was ist neu"-Hinweis funktioniert zuverlässig
- Fix: Artikel aus neu angelegten Kategorien erschienen nicht bei „Einkaufen" (fehlende dynamische Container)
- „Artikel hinzufügen" bei Drogerie auch bei zugeklappten Unterkategorien erreichbar
- Beim Start sind alle Kategorien zunächst eingeklappt (Übersicht)

### v3.4.2
- Fix: Icon einer Kategorie ändern löschte den bereits eingegebenen Namen (Dialog wurde beim Icon-Wechsel komplett neu aufgebaut statt nur die Anzeige zu aktualisieren)
- Kategorien sind jetzt beim Öffnen immer eingeklappt — auch die Unterkategorien (Default-Logik umgekehrt: fehlt ein Eintrag im Klapp-Status, gilt „eingeklappt")
- „What's New"-Hinweis: blinkende Sprechblase zwischen App-Titel und Versionsnummer statt kleinem Punkt
- Bei neuer Version bekommt die Familie automatisch eine Push „Update verfügbar" (einmalig pro Version, über geteilten Supabase-Status `S.lastNotifiedVersion` abgesichert)

### v3.4.3
- Artikel können ein eigenes Foto aus der Mediathek bekommen statt nur ein Symbol — beim Neuanlegen UND beim Bearbeiten (Feld `img` am Artikel, 480×480 JPEG komprimiert via Canvas-Resize, `resizePhoto()`)
- Langes Drücken (nicht Tippen) auf einen Artikel zeigt Bild/Symbol groß an (Long-Press-Timer ~480ms, `lpStart`/`lpCancel`/`showItemPreview`)

### v3.4.4
- Fix: Langer Artikelname überlagerte visuell die Mengen-Steuerung (−/Zahl/+) bei ausgewählten Artikeln
- Artikelname wird bei Platzmangel jetzt mit Ellipsis („…") sauber abgeschnitten statt zu überlappen (CSS: `text-overflow:ellipsis`, `min-width:0` auf den Flex-Containern)

## Bekannte offene Probleme (noch NICHT umgesetzt — als nächstes zu tun)
1. **Bild/Symbol wird beim Auswählen eines existierenden Katalog-Artikels nicht in die Einkaufsliste übernommen.** Funktion `toggleItem(item, cat)`: beim Push in `S.list` fehlen die Felder `icon` und `img` (die beim Neu-Anlegen über `doAdd()` korrekt gesetzt werden). Dadurch zeigt „Einkaufen" kein Bild, obwohl „Planen" es anzeigt (dort wird direkt aus dem Katalog-Objekt gerendert).
2. **Eigene Kategorien sind nicht zwischen Familienmitgliedern synchronisiert.** `getUserCats()`/`saveUserCats()` lesen/schreiben aktuell aus `localStorage` (`user_cats`) statt aus dem synchronisierten `S`-State. Das bedeutet: legt eine Person eine neue Kategorie an, sehen andere Familienmitglieder sie auf ihrem Gerät nicht. Sollte in `S.userCats = {s:[],d:[]}` verschoben und wie der Rest des States über `push()`/Supabase synchronisiert werden. Für bereits lokal angelegte Kategorien braucht es eine einmalige Migration (alten `localStorage`-Wert beim Start einlesen und ins synchronisierte `S` übernehmen), damit nichts verloren geht.

## Wichtige Implementierungsdetails / Konventionen für Weiterarbeit
- Dialoge laufen alle über ein gemeinsames Overlay (`#ovl`, `#dlg-ttl`, `#dlg-msg`, `#dlg-btns`). **Vorsicht:** Wird innerhalb eines offenen Dialogs ein zweiter Picker (z.B. Icon- oder Bildauswahl) über dasselbe Overlay geöffnet, überschreibt das `dlg-msg` und zerstört dabei alle Eingabefelder des ursprünglichen Dialogs. Muster zur Vermeidung: Formularwerte **vor** dem Öffnen des Sub-Dialogs in eine Variable zwischenspeichern (`draft`-Pattern) und nach Auswahl den ursprünglichen Dialog mit den zwischengespeicherten Werten neu aufbauen (siehe `pickEditItemImage()`, `pickNewCatIcon()`).
- Versionierung: `VER`-Konstante am Anfang des Scripts, plus `CHANGELOG`-Objekt (Key = Versionsnummer, Value = Array von Bullet-Points als String). Bei jeder neuen Version: `VER` hochzählen + neuen Eintrag in `CHANGELOG` ergänzen. Achtung bei Anführungszeichen in den Changelog-Strings — deutsche „…"-Anführungszeichen sind ok, aber gerade Anführungszeichen (`"`) innerhalb eines doppelt-gequoteten JS-Strings müssen escaped werden (`\"`), sonst Syntaxfehler.
- Der rote „What's New"-Hinweis (`#whatsnew-badge`) wird über `checkVersionBadge()` gesteuert (Vergleich `localStorage['seen_version']` vs. `VER`) — muss beim App-Start explizit aufgerufen werden, sonst bleibt er inaktiv.
- Icon-Palette (`ICON_PALETTE`) wird sowohl für Kategorie-Icons als auch für Artikel-Icons (`openItemMediaPicker`) verwendet.
