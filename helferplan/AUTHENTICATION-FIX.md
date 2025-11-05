# Behebung des 401 Unauthorized Fehlers

## Problem
Benutzer können sich erfolgreich anmelden, werden aber bei jedem Fensterwechsel oder beim Drücken von F5 (Seite neu laden) abgemeldet. Der Fehler tritt auf, wenn `/api/current-user` mit einem 401 (Unauthorized) Status antwortet.

```
GET https://meinraspi-tcp-helferplan.lgrw.de/api/current-user 401 (Unauthorized)
{
  "authenticated": false
}
```

## Ursache
Das Problem lag in der Cookie-Konfiguration für HTTPS-Verbindungen:

1. **Cookie Secure-Flag**: Die ursprüngliche Implementierung setzte das `secure`-Flag nur, wenn `NODE_ENV === 'production'` war. Dies funktionierte nicht zuverlässig in allen Deployment-Szenarien.

2. **HTTPS-Erkennung**: Bei HTTPS-Verbindungen (wie `https://meinraspi-tcp-helferplan.lgrw.de`) müssen Cookies mit `secure: true` gesetzt werden, sonst werden sie vom Browser nicht gespeichert/gesendet.

## Lösung
Die Cookie-Konfiguration wurde aktualisiert, um HTTPS-Verbindungen automatisch zu erkennen:

```javascript
// Set secure flag for HTTPS connections or when sameSite is 'none'
// req.secure is true when the connection is HTTPS (works with trust proxy)
const cookieSecure = req.secure || req.protocol === 'https' || sameSiteMode === 'none';

res.cookie('hp_session', token, {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: sameSiteMode,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
});
```

### Was wurde geändert:
- **Vorher**: `const cookieSecure = process.env.NODE_ENV === 'production' || sameSiteMode === 'none';`
- **Nachher**: `const cookieSecure = req.secure || req.protocol === 'https' || sameSiteMode === 'none';`

Die neue Implementierung:
1. Prüft `req.secure` (true bei HTTPS, funktioniert mit `trust proxy`)
2. Prüft `req.protocol === 'https'` als Fallback
3. Setzt `secure: true` auch wenn `sameSiteMode === 'none'`

## Deployment-Anleitung

### 1. Umgebungsvariablen konfigurieren

Für Ihre Production-Deployment bei `https://meinraspi-tcp-helferplan.lgrw.de`:

```bash
# Session-Secret (PFLICHT für Production!)
export HELFERPLAN_SESSION_SECRET="ihr-sicheres-zufälliges-secret-hier"

# Erlaubte Origins (Ihre Production-Domain)
export ALLOWED_ORIGINS="https://meinraspi-tcp-helferplan.lgrw.de"

# Cookie SameSite Mode (Standard: 'lax')
# 'lax' funktioniert für same-site Anfragen und Top-Level-Navigation
export COOKIE_SAMESITE=lax
```

### 2. Server neu starten

```bash
cd helferplan
npm install  # Falls Abhängigkeiten geändert wurden
npm start
```

### 3. Browser-Cache und Cookies löschen

Wichtig: Benutzer sollten ihren Browser-Cache und Cookies für die Domain löschen:

**Chrome/Edge:**
1. Einstellungen → Datenschutz und Sicherheit → Browserdaten löschen
2. "Cookies und andere Websitedaten" auswählen
3. Zeitraum: "Gesamte Zeit"
4. "Daten löschen" klicken

**Firefox:**
1. Einstellungen → Datenschutz & Sicherheit → Cookies und Website-Daten
2. "Daten entfernen..." klicken
3. "Cookies und Website-Daten" auswählen
4. "Leeren" klicken

**Alternativ:** Verwenden Sie ein privates/Inkognito-Fenster zum Testen.

## Testing-Frage: CORS und lokales Testen

### Frage
"Wie kannst du den Code testen, da ich ja deine Seite, die du bei Cloudflare deployst, nicht auf der CORS allowed Liste habe?"

### Antwort
Das ist kein Problem aus folgenden Gründen:

1. **Lokales Testen**: Der Code kann lokal getestet werden, ohne CORS-Probleme:
   ```bash
   cd helferplan
   npm start
   ```
   Der Server läuft dann auf `http://localhost:3003` und die CORS-Konfiguration erlaubt automatisch localhost-Origins in der Entwicklung.

2. **Non-Production-Modus**: Im Development-Modus (`NODE_ENV !== 'production'`) erlaubt die CORS-Konfiguration automatisch alle Origins:
   ```javascript
   if (allowedOrigins.includes(origin)) {
       callback(null, true);
   } else if (process.env.NODE_ENV !== 'production') {
       console.log('CORS: Allowing origin in non-production mode:', origin);
       callback(null, true);
   }
   ```

3. **Keine externe Tests nötig**: Die Änderungen am Cookie-Handling sind serverseitig und benötigen keine Tests von externen Domains.

4. **Production-Testing**: In Production sollten Sie Ihre eigene Domain zu `ALLOWED_ORIGINS` hinzufügen:
   ```bash
   export ALLOWED_ORIGINS="https://meinraspi-tcp-helferplan.lgrw.de,https://ihre-andere-domain.de"
   ```

## Erwartetes Verhalten nach dem Fix

Nach Anwendung dieses Fixes sollte folgendes funktionieren:

✅ **Login funktioniert** - Benutzer können sich mit Name und E-Mail anmelden
✅ **Session bleibt bestehen** - Session bleibt nach Seitenwechsel erhalten  
✅ **F5/Refresh funktioniert** - Seite neu laden beendet die Session nicht mehr
✅ **Authentifizierung persistent** - `/api/current-user` gibt 200 OK zurück mit User-Daten
✅ **Schreibrechte funktionieren** - Editor/Admin können Daten ändern

## Troubleshooting

### Problem: Immer noch 401 Fehler

1. **Server neu gestartet?** Stellen Sie sicher, dass der Server mit dem neuen Code neu gestartet wurde.

2. **Browser-Cache gelöscht?** Alte Cookies müssen entfernt werden.

3. **HTTPS aktiv?** Prüfen Sie, ob die Verbindung wirklich HTTPS ist:
   ```bash
   curl -I https://meinraspi-tcp-helferplan.lgrw.de/api/current-user
   ```

4. **Proxy-Konfiguration?** Wenn Sie einen Reverse-Proxy (nginx, Apache) verwenden:
   - Stellen Sie sicher, dass `X-Forwarded-Proto` Header gesetzt wird
   - Der Express-Server hat bereits `app.set('trust proxy', 1)` konfiguriert

5. **ALLOWED_ORIGINS korrekt?** Prüfen Sie die Server-Logs:
   ```
   CORS: Configured with 1 allowed origin(s)
   ```

### Problem: Cookie wird nicht gesetzt

1. **DevTools prüfen**: Browser DevTools → Application → Cookies
   - Sollte `hp_session` Cookie sehen mit `HttpOnly` und `Secure` Flags
   
2. **Cookie-Attribute prüfen**:
   - `HttpOnly`: ✓ (sollte gesetzt sein)
   - `Secure`: ✓ (sollte bei HTTPS gesetzt sein)
   - `SameSite`: `Lax` (Standard)
   - `Max-Age`: `86400` (24 Stunden)

### Problem: CORS-Fehler

```
Access to fetch at '...' from origin '...' has been blocked by CORS policy
```

**Lösung**: Fügen Sie die Origin zu `ALLOWED_ORIGINS` hinzu:
```bash
export ALLOWED_ORIGINS="https://ihre-domain.de,https://andere-domain.de"
```

## Sicherheitshinweise

1. ✅ **HTTPS in Production**: Verwenden Sie immer HTTPS in Production
2. ✅ **Session-Secret**: Generieren Sie ein starkes, zufälliges Secret
3. ✅ **ALLOWED_ORIGINS**: Nur vertrauenswürdige Domains hinzufügen
4. ✅ **Cookie-Flags**: HttpOnly und Secure sind korrekt konfiguriert

## Geänderte Dateien

- `helferplan/helferplan.js` - Cookie-Konfiguration für HTTPS verbessert

## Support

Bei weiteren Problemen:
1. Prüfen Sie die Browser-Konsole auf Fehler
2. Prüfen Sie die Server-Logs
3. Verifizieren Sie die Umgebungsvariablen
4. Testen Sie mit einem privaten/Inkognito-Fenster
