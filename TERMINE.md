# Termine – Rallly im grünen Design mit Kalenderanbindung

Dieser Fork von [Rallly](https://github.com/lukevella/rallly) (Basis: v4.16.1)
läuft unter https://termine.guertler.cloud. Er ergänzt Rallly um ein eigenes
Design ohne Lizenzschlüssel und um die Anbindung persönlicher Kalender.

Rallly steht unter der **AGPL-3.0**. Wer den Fork als Dienst betreibt, muss
den Quelltext der laufenden Version öffentlich zugänglich halten – deshalb ist
dieses Repository öffentlich, und der Hinweis „Powered by Rallly“ bleibt
standardmäßig sichtbar.

## Was der Fork ändert

### Design (Control Panel → Design)

- Grünes Corporate Design als Standard: Farben Tanne, Klee, Grashalm, Sonne
  und Sand, PT Sans als Schrift, eigenes Logo und App-Name „Termine“.
- Der Design-Bereich braucht **keinen Lizenzschlüssel**. Er ersetzt die
  frühere Branding-Seite und bietet Vorlagen (Grün · Tanne, Grün · Klee,
  Grün · Sand, Rallly) sowie eigene Werte für Akzent- und Hintergrundfarben
  (hell/dunkel), Grautöne, Eckenradius, Schriften, Logos, App-Icon und
  eigenes CSS – mit Live-Vorschau.
- **GrueneType Neue** darf wegen ihrer Lizenz nicht im Repository liegen. Wer
  sie nutzen darf, lädt die Schriftdatei (WOFF2) im Design-Bereich als
  Überschriftenschrift hoch; sie wird in der Datenbank der Instanz gespeichert.

### Kalender (Einstellungen → Kalender)

- **CalDAV**: Nextcloud, iCloud, mailbox.org, Posteo, Fastmail, GMX, WEB.DE
  und jeder andere CalDAV-Server. Die Kalender werden über die Serveradresse
  gefunden (RFC 6764). Passwörter werden mit `SECRET_PASSWORD` verschlüsselt
  gespeichert; App-Passwörter sind empfohlen.
- **Google Kalender** über OAuth, sobald `GOOGLE_CLIENT_ID` und
  `GOOGLE_CLIENT_SECRET` gesetzt sind. Wer sich mit Google anmeldet, bekommt
  beim Verbinden das eigene Konto vorgeschlagen.
- Auf der Umfrageseite sehen angemeldete Teilnehmende ihren Kalender:
  - pro Termin, ob er frei ist, sich überschneidet oder nur für eine andere
    Umfrage vorgemerkt ist (mit den Einträgen im Tooltip),
  - eine Übersicht und die Tagesagenda der Umfragetage,
  - „Aus Kalender übernehmen“ und – wenn gewünscht – automatische
    Vorbelegung der Antworten; jede Antwort bleibt änderbar.
- **Vorläufige Einträge**: Beim Abstimmen wird für jeden zugesagten Termin
  ein Eintrag „Vorläufig: …“ (Status TENTATIVE) im gewählten Kalender
  angelegt, auf Wunsch auch für „Falls erforderlich“.
- **Festlegen**: Legt die Organisation einen Termin fest, verschwinden alle
  Platzhalter. Wer zugesagt hat, behält genau einen festen Eintrag mit Titel,
  Beschreibung, Ort, Videolink, Organisator und Link zur Umfrage. Er trägt
  dieselbe UID wie die Einladungs-Mail, sodass beide im Kalender zu einem
  Eintrag verschmelzen; einen schon aus der Mail übernommenen Eintrag
  übernimmt der Fork, statt ihn zu verdoppeln.
- Änderungen an der Umfrage, Absage, Löschen und das Trennen eines Kalenders
  werden in die Kalender übertragen.

Der Fork speichert keine Kalenderinhalte: Termine werden beim Aufruf der
Umfrage gelesen. Gespeichert werden nur Verweise auf die selbst angelegten
Einträge (`calendar_holds`).

## Konfiguration

| Variable | Zweck |
| --- | --- |
| `CALENDARS_ENABLED=true` | schaltet die Kalenderfunktionen ein |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google-Anmeldung und Google Kalender (optional) |
| `CALDAV_ALLOW_PRIVATE_URLS=true` | nur nötig, wenn der CalDAV-Server im privaten Netz liegt (z. B. eine Nextcloud im selben Docker-Netz); sonst blockiert der Fork solche Adressen zum Schutz vor SSRF |

### Google Cloud einrichten

1. In der [Google Cloud Console](https://console.cloud.google.com/) ein
   Projekt anlegen und die **Google Calendar API** aktivieren.
2. Unter „APIs & Dienste → OAuth-Zustimmungsbildschirm“ die App einrichten
   (Typ „Extern“), die Bereiche `calendar.readonly`, `calendar.events`,
   `userinfo.email` und `userinfo.profile` eintragen und die App
   veröffentlichen (oder Testnutzer eintragen).
3. Unter „Anmeldedaten“ eine **OAuth-Client-ID** vom Typ „Webanwendung“
   anlegen mit diesen autorisierten Weiterleitungs-URIs:
   - `https://termine.guertler.cloud/api/auth/callback/google` (Anmeldung)
   - `https://termine.guertler.cloud/api/integrations/callback/google-calendar`
     (Kalender)
4. Client-ID und -Secret als `GOOGLE_CLIENT_ID` und `GOOGLE_CLIENT_SECRET`
   setzen und neu deployen.

## Image bauen und deployen

Ein Tag `termine-<rallly-version>-<n>` (z. B. `termine-4.16.1-1`) startet den
Workflow `.github/workflows/termine-image.yml`. Er baut das Image und
veröffentlicht es als `ghcr.io/<owner>/rallly:<rallly-version>-<n>`. Im
Deployment wird immer dieses feste Tag eingetragen, nie `latest`.

## Upstream-Updates übernehmen

```sh
git remote add upstream https://github.com/lukevella/rallly.git
git fetch upstream --tags
git merge v4.x.y            # neue Rallly-Version
pnpm install && pnpm db:generate
pnpm type-check && pnpm test:unit
```

Danach die Playwright-Tests laufen lassen; `tests/calendar-holds.spec.ts`
braucht einen CalDAV-Server unter `CALDAV_TEST_URL` (in CI startet der
Workflow dafür Radicale). Anschließend ein neues `termine-…`-Tag setzen.

## Entwicklung

Wie in Rallly (`pnpm dev`). Für die Kalender in `apps/web/.env`
`CALENDARS_ENABLED=true` und `CALDAV_ALLOW_PRIVATE_URLS=true` setzen und einen
lokalen CalDAV-Server starten, z. B. Radicale:

```sh
pip install radicale
printf 'ben:geheim\n' > users
radicale --server-hosts 127.0.0.1:5232 --auth-type htpasswd \
  --auth-htpasswd-filename users --auth-htpasswd-encryption plain
```
