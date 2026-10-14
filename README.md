# Pi-Radio

Internetradio für Touch und Maus, Helvetica, Deutsch. HTML/CSS/JavaScript ohne Build-Schritt; getrennt vom Startmenü und Wetter.

```sh
npm run dev
```

Allein: **http://127.0.0.1:5176/**. In der gemeinsamen Umgebung: **http://127.0.0.1:5173/** → Radio.

Sender antippen oder Abspielen drücken. Stummschaltung und Stoppen stehen direkt zur Verfügung. Die Lautstärke wird am Mac/Pi beziehungsweise an der Box geregelt; die App hat keinen Lautstärke-Slider. Eigene Sender lassen sich als direkte HTTPS-Audio-URL hinzufügen, maximal 30. Keine Webseiten- oder Playlist-URLs; Wiedergabe hängt von Browsercodec und Erreichbarkeit ab. Senderauswahl und eigene Sender werden lokal gespeichert. Keine automatische Tonwiedergabe beim Öffnen. Bei Navigation innerhalb des Startmenüs bleibt Audio aktiv; ein Neuladen oder Schließen der Browserseite beendet die Wiedergabe.

## Bluetooth

Auf dem Pi: **Audioausgabe → Boxen suchen → Gerät auswählen → Koppeln**. Die Box bzw. den Empfänger vorher in den Kopplungsmodus bringen. Die Suche dauert etwa 15 Sekunden und zeigt klassische Bluetooth-Audiogeräte mit gemeldeter Audiofunktion, zwei pro Seite. Bereits gekoppelte Geräte bieten **Verbinden**. Nach erfolgreicher Auswahl steht **„Verbunden · Audio bereit“** am Gerät; **Trennen** beendet die Verbindung, ohne die gespeicherte Kopplung zu löschen. Die Lautstärke bleibt an Box/System einstellbar, ohne zusätzlichen App-Regler.

Die Kopplung unterstützt Audioempfänger ohne PIN-Eingabedialog. Der tatsächlich ausgestrahlte Gerätename wird angezeigt. Falls ein Empfänger nicht erscheint oder nicht verbindet, den Kopplungsmodus erneut aktivieren und gegebenenfalls eine bestehende Verbindung zu einem anderen Gerät trennen. Anschließend Sender starten und Ton testen.

`server/bluetooth.mjs` verbindet die lokale Oberfläche mit **BlueZ (`bluetoothctl`)** und dem Audio-Dienst über **`pactl`**. Benötigt wird Raspberry Pi OS mit Desktop, funktionierendem Bluetooth und PipeWire/PulseAudio. Den Node-Server als denselben angemeldeten Benutzer wie Chromium starten, **nicht mit sudo**. Bei Bedarf auf dem Pi: `sudo apt install bluez pulseaudio-utils libspa-0.2-bluetooth`. Die Lite-Ausgabe braucht zusätzlich eine eingerichtete Audio-Sitzung; sie ist kein direkt getesteter Zielaufbau.

Die App prüft die gespeicherte Kopplung, koppelt nur neue Geräte, vertraut dem ausdrücklich ausgewählten Empfänger und verbindet ihn. Sie wählt das verfügbare A2DP-Stereoprofil und die Systemausgabe. Bereits laufende Chromium-/Firefox-Audiostreams werden dorthin verschoben; andere Programme werden nicht aktiv verschoben. Neue Systemtöne können ebenfalls die neue Standardausgabe nutzen. „Audio bereit“ setzt eine bestätigte Verbindung und Audioausgabe voraus. Eine reine Bluetooth-Verbindung ohne Stereoaudio erscheint nicht als Erfolg. Die App ändert weder Mikrofonkonfiguration noch Lautstärke. Nach einem Neustart bleibt die BlueZ-Kopplung gespeichert; eine automatische Wiederverbindung hängt vom Betriebssystem und Empfänger ab. Die App hat keine dauernde Wiederverbindungsschleife.

Auf dem **Mac** bleibt die echte Kopplung unter Systemeinstellungen → Bluetooth und Ton. **Demo ansehen** erlaubt die Touchbedienung mit ausdrücklich markierten Beispielgeräten. Die Demo sendet keinerlei Kopplungs- oder Audiobefehle. Eine normale Webseite kann Bluetooth-Audioempfänger nicht über Web Bluetooth koppeln; der lokale Pi-Dienst übernimmt diese Aufgabe. Falls der Browser die Audioauswahl unterstützt, bleibt „Ausgabe im Browser wählen“ verfügbar.

Der Adapter läuft sowohl im eigenständigen Radioserver als auch im gemeinsamen Startmenü unter `api/bluetooth`. Nur lokale Anfragen, begrenzte JSON-Aktionen und fest vorgegebene Befehle mit Argumentlisten sind erlaubt; keine Shell und keine frei wählbaren Betriebssystembefehle. Fremde Origins und unbekannte Geräteadressen werden abgewiesen. Es läuft höchstens eine Bluetooth-Aktion gleichzeitig. Ein fehlender Adapter oder Audio-Dienst wird ausdrücklich angezeigt. Kein zusätzlicher Dienst mit Rootrechten nötig.

**Prüfstand:** Mac-Fallback und Demo sowie simulierte Linux-Antworten in Chrome/WebKit auf 480 × 320, 480 × 480, 800 × 480 und 1280 × 720 geprüft, einschließlich kalibrierter Klickpositionen. Diensttests prüfen PIN-freie Kopplung, Wiederverbindung ohne erneutes Pairing, Stereoausgabe, Fehler, parallele Anfragen und HTTP-Zugriff. BlueZ-5.66-Befehle wurden gegen den Quelltext abgeglichen. **Funkverbindung und Audioausgabe müssen auf der jeweiligen Hardware zusätzlich geprüft werden.**

Quellen: [BlueZ bluetoothctl](https://manpages.debian.org/trixie/bluez/bluetoothctl.1.en.html), [BlueZ 5.66](https://github.com/bluez/bluez/blob/5.66/client/main.c), [pactl](https://manpages.debian.org/trixie/pulseaudio-utils/pactl.1.en.html), [Raspberry Pi: PipeWire](https://www.raspberrypi.com/news/bookworm-the-new-version-of-raspberry-pi-os/).

Prüfen: `npm test`; bei laufender gemeinsamer Vorschau zusätzlich `node ../startmenue/tests/radio-bluetooth.mjs` und dieselbe Zeile mit `webkit` am Ende.

## Senderreihenfolge

1. COSMO
2. Beats Radio
3. Berlin Klubradio — der Berliner Stream von pure fm (nicht Frankfurt an der Oder)
4. radioeins
5. Radio Swiss Jazz

Danach folgen Fritz, Deutschlandfunk, Dlf Kultur und Dlf Nova. Die Senderliste zeigt vier Sender pro Seite; Radio Swiss Jazz steht zuerst auf Seite 2. Eine gespeicherte Auswahl bleibt erhalten; bei der ersten Nutzung ist COSMO ausgewählt.

## Senderquellen

Am 8./9.10.2026 anhand der offiziellen Angaben geprüft:

- [WDR-Webradioadressen](https://www1.wdr.de/unternehmen/der-wdr/empfang-technik/webradio-100.amp): COSMO, offizieller MP3-Stream.
- [Beats-Radio-Webplayer](https://www.beatsradio.de/music-streaming-app/webradios/): Beats Radio national; HTTPS-Weiterleitung unter `live.streams.klassikradio.de`.
- [pure-fm-Player](https://pure-fm.de/live/): `purefm-bln.mp3` ist die Berliner Ausgabe. Der Player führt Frankfurt (Oder) separat als `purefm-ff.mp3`.
- [rbb-Streamübersicht](https://www.rbb-online.de/radio/frequenzen/livestreams.html): radioeins und Fritz. Verwendet werden die HTTPS-Dispatcher-Adressen der offiziellen Weiterleitungen, keine kurzlebigen Stream-Token.
- [Radio Swiss Jazz – Internetempfang](https://www.radioswissjazz.ch/en/reception/internet): offizieller MP3-Stream mit 128 kbit/s unter `https://stream.srg-ssr.ch/srgssr/rsj/mp3/128`.
- [Deutschlandradio-Streamadressen](https://www.deutschlandradio.de/aenderungen-internet-streaming-100.html): Deutschlandfunk, Deutschlandfunk Kultur und Deutschlandfunk Nova.

Stream-URLs stehen in `src/stations.js`; Sender liefern keine garantierte Verfügbarkeit. Fehler werden angezeigt, ohne einen anderen Sender einzuschalten. Internetradio benötigt eine Verbindung. Es werden keine Streams aufgezeichnet oder zwischengespeichert.

Ein eigenes Git-Repository kann diesen Ordner vollständig und ohne Abhängigkeit vom Wetter-Quellcode enthalten. Der kleine eigenständige Server liefert die lokale Oberfläche und den begrenzten Adapter für Titelinformationen.

## Senderauswahl und Titelinformationen

Der Sendername ist eine Schaltfläche mit aufklappbarer Senderliste. Die Hauptansicht zeigt Sender, Programm-/Titelangabe, gegebenenfalls Interpret und tatsächliche Streamdaten (Codec, Bitrate, Abtastrate). Kurze Titel bleiben ruhig stehen; die Darstellung priorisiert lesbaren Text. Es gibt keine erfundene UKW-Frequenz, Empfangsstärke oder Audio-Spektrumanimation. Auch ein Stationsname oder Sendungsname kann die vom Sender gelieferte Angabe sein.

`server/metadata.mjs` liest für die eingebauten Sender einen begrenzten ICY-Metadatenblock, auch bei Radio Swiss Jazz. Beats verwendet den Titelservice des offiziellen Players. COSMO verwendet zusätzlich die [offizielle WDR-Playlist](https://www1.wdr.de/radio/cosmo/musik/playlist/index.html): `server/cosmo.mjs` liest Titel, Interpret und Sendezeit aus deren Ergebnistabelle, höchstens 1 MiB HTML pro Abruf. Es werden keine anderen Webseiten durchsucht.

COSMO erscheint als **„Zuletzt gespielt“** mit der Sendezeit in Europe/Berlin, einschließlich Datum. Die Playlist kann dem hörbaren Stream hinterherlaufen; eine sekundengenaue Synchronisation ist nicht zugesichert. Angaben über 20 Minuten werden als älter markiert, über 24 Stunden sowie zukünftige Einträge verworfen. Bei fehlender Playlist fällt die Anzeige ausdrücklich auf „Streamangabe · Playlist fehlt“ zurück. Bei geändertem Tabellenformat oder ausgefallenen Quellen werden keine Titel erfunden. Der HTML-Adapter kann bei Änderungen der WDR-Seite eine Anpassung benötigen.

Der Abruf wird nach spätestens neun Sekunden beendet, Antworten werden 45 Sekunden im Arbeitsspeicher wiederverwendet, gleichzeitige identische Anfragen zusammengefasst. Titel werden alle 45 Sekunden aktualisiert. Website-Adressen werden nicht als Songtitel ausgegeben; veraltete Beats-Playlistangaben werden verworfen. Fehlende oder nicht erreichbare Angaben sind sichtbar. Eigene Sender haben noch keine angebundene Titelquelle. Es werden keine Audiodateien gespeichert. Der Adapter läuft sowohl im eigenen lokalen Server als auch im gemeinsamen Startmenü; ohne diesen Dienst bleiben Radio und Senderauswahl nutzbar, Titelinformationen fehlen.

Prüfung: `node --test server/metadata.test.mjs` (neun Tests: fragmentierte Metadaten, Umlaute, fehlende Angaben, abgelaufene Titel, Berliner Sommer-/Winterzeit, Playlist-/Stream-Rückfall, Senderreihenfolge und Beschränkung auf bekannte Sender). Die gemeinsame Browserprüfung liegt in `../startmenue/tests/radio-playlist.mjs`, auch mit Argument `webkit` ausführbar; lokale Vorschau erforderlich.
