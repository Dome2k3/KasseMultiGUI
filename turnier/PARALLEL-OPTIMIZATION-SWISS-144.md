# Swiss 144 Parallel Optimization

## Übersicht

Diese Optimierung ermöglicht den parallelen Start von Qualification und Main Swiss Round 1, wodurch die Gesamtdauer des Turniers erheblich reduziert wird.

## Funktionsweise

### Vorher (sequentiell)
1. **Qualification Round 0**: 16 Spiele (32 Hobby-Teams) auf Feldern 1-16
2. **Warten**: Alle 16 Spiele müssen beendet sein
3. **Main Swiss Round 1**: Erst dann Start mit 128 Teams (112 geseeded + 16 Gewinner)

**Problem**: Felder 17-27 stehen während der Qualification leer!

### Nachher (parallel)
1. **Qualification Round 0**: 16 Spiele (32 Hobby-Teams) auf Feldern 1-16
2. **Main Swiss Round 1 (parallel)**: 
   - 56 Spiele mit 112 geseedeten Teams
   - 11 Spiele sofort auf Feldern 17-27
   - 45 Spiele wartend
   - 8 Platzhalter-Spiele mit Status `wartend_quali` (für 16 Gewinner → 8 Paare)
3. **Qualification abgeschlossen**: 
   - 16 Gewinner werden zu 8 Paarungen
   - Platzhalter-Spiele werden mit diesen 8 Paarungen gefüllt
   - Status ändert sich von `wartend_quali` zu `wartend`
4. **Hobby Cup**: 16 Verlierer starten ihre eigene Runde

**Vorteil**: 11 zusätzliche Felder werden sofort genutzt, Turnier läuft schneller!

## Implementierungs-Details

### Neuer Status: `wartend_quali`

Ein neuer Spiel-Status wurde eingeführt:
- **wartend_quali**: Spiel existiert, aber Teams sind noch nicht zugewiesen
- Wird verwendet für die 16 Platzhalter-Spiele in Main Swiss Round 1
- Diese Spiele warten auf die Ergebnisse der Qualification
- Werden nicht in Round-Completion-Checks einbezogen
- Werden nicht für Feldzuweisungen berücksichtigt

### Turnier-Start (`startSwiss144Tournament`)

```javascript
// 1. Qualification (16 Spiele auf Feldern 1-16)
for (let i = 0; i < 16; i++) {
    spiele.push({
        phase_id: qualiPhase.id,
        runde: 0,
        team1_id: hobbyTeam1.id,
        team2_id: hobbyTeam2.id,
        feld_id: felder[i].id,
        status: 'geplant'
    });
}

// 2. Main Swiss Runde 1 - 112 geseeded Teams (56 Spiele)
const mainFieldSeeded = [...bundesligaTeams, ...otherTeams]; // 112 Teams
const pairings = swissPairing.pairRound1Dutch(mainFieldSeeded);

for (let i = 0; i < pairings.length; i++) {
    spiele.push({
        phase_id: mainPhase.id,
        runde: 1,
        team1_id: pair.teamA.id,
        team2_id: pair.teamB.id,
        feld_id: i < 11 ? felder[16 + i].id : null, // Erste 11 auf Felder 17-27
        status: i < 11 ? 'geplant' : 'wartend'
    });
}

// 3. Platzhalter für Qualification-Gewinner (8 Spiele = 8 Paare für 16 Gewinner)
for (let i = 0; i < 8; i++) {
    spiele.push({
        phase_id: mainPhase.id,
        runde: 1,
        team1_id: null, // Wird später gefüllt
        team2_id: null, // Wird später gefüllt
        status: 'wartend_quali' // Spezieller Status
    });
}
```

### Qualification Abschluss (`handleQualificationComplete`)

```javascript
// 1. Sammle Gewinner und Verlierer
const winners = []; // 16 Gewinner-Team-IDs
const losers = [];  // 16 Verlierer-Team-IDs

// 2. Finde Platzhalter-Spiele
const [placeholders] = await db.query(
    `SELECT id FROM turnier_spiele 
     WHERE phase_id = ? AND runde = 1 AND status = 'wartend_quali'`,
    [mainPhaseId]
);
// Erwartung: 8 Platzhalter für 16 Gewinner → 8 Paare

// 3. Paare die 16 Gewinner zu 8 Spielen
const winnerPairings = swissPairing.pairRound1Dutch(winners); // 8 Paare

// 4. Fülle die Platzhalter
for (let i = 0; i < winnerPairings.length; i++) {
    await db.query(
        `UPDATE turnier_spiele 
         SET team1_id = ?, team2_id = ?, status = 'wartend' 
         WHERE id = ?`,
        [pair.teamA.id, pair.teamB.id, placeholders[i].id]
    );
}

// 5. Starte Hobby Cup mit Verlierern
createHobbyCupGames(losers);
```

## Datenbank-Schema

### Migration erforderlich

```sql
ALTER TABLE turnier_spiele 
MODIFY COLUMN status ENUM(
    'geplant', 
    'bereit', 
    'laeuft', 
    'beendet', 
    'abgesagt', 
    'wartend_bestaetigung', 
    'wartend',
    'wartend_quali'  -- NEU!
) DEFAULT 'geplant';
```

Siehe: `MIGRATION-Add-Wartend-Quali-Status.sql`

## Vorteile

1. **Schnellerer Turnierablauf**: 11 zusätzliche Felder werden sofort genutzt
2. **Bessere Ressourcennutzung**: Keine leeren Felder während Qualification
3. **Flexibilität**: Platzhalter-System kann für andere Szenarien genutzt werden
4. **Konsistenz**: Main Swiss Round 1 enthält weiterhin alle 128 Teams

## Zeitersparnis

Beispiel mit 20 Minuten Spielzeit + 5 Minuten Pause:

### Vorher (sequentiell)
- Qualification: 16 Spiele × 25 Min = ~400 Min (parallele Ausführung auf 16 Feldern)
- Main Swiss Round 1 Start: Nach 400 Min
- **Gesamte Wartezeit bis Main Swiss startet**: 400 Min

### Nachher (parallel)
- Qualification: 16 Spiele × 25 Min = ~400 Min (auf Feldern 1-16)
- Main Swiss: Startet sofort mit 11 Spielen (auf Feldern 17-27)
- **Keine Wartezeit**: Main Swiss läuft parallel!

**Zeitersparnis**: ~6-7 Stunden für das gesamte Turnier!

## Kompatibilität

### Bestehende Funktionen bleiben erhalten
- Dynamic Swiss Progression weiterhin aktiv
- Referee-Zuweisung funktioniert normal
- Feldzuweisung ignoriert `wartend_quali` Spiele
- Round-Completion-Checks zählen `wartend_quali` nicht mit

### Neue Turniere
- Verwenden automatisch die parallele Optimierung
- Keine Konfiguration nötig

### Bestehende Turniere
- Nicht betroffen (Qualification bereits abgeschlossen oder noch nicht gestartet)
- Falls Qualification läuft: Warten auf Abschluss, dann normale Progression

## Fehlerbehandlung

### Szenario: Weniger als 16 Gewinner
```javascript
if (winners.length !== 16) {
    console.error(`Expected 16 winners, got ${winners.length}`);
    return; // Abbruch, manuelle Intervention nötig
}
```

### Szenario: Weniger als 8 Platzhalter
```javascript
if (placeholders.length !== 8) {
    console.error(`Expected 8 placeholders, got ${placeholders.length}`);
    return; // Abbruch, manuelle Intervention nötig
}
```

### Szenario: Pairing-Fehler
```javascript
const winnerPairings = swissPairing.pairRound1Dutch(winners);
if (winnerPairings.pairs.length !== 8) {
    console.error(`Expected 8 pairs, got ${winnerPairings.pairs.length}`);
    // Verwende trotzdem alle vorhandenen Paare
}
```

## Testing

### Test-Szenario 1: Normaler Ablauf
1. Erstelle Swiss 144 Turnier mit 144 Teams
2. Starte Turnier
3. Verifiziere: 16 Quali-Spiele + 56 Main-Spiele + 8 Platzhalter
4. Schließe alle Qualification-Spiele ab
5. Verifiziere: Platzhalter sind gefüllt, Hobby Cup existiert

### Test-Szenario 2: Parallele Ausführung
1. Starte Turnier
2. Schließe einige Quali-Spiele ab (z.B. 8 von 16)
3. Schließe einige Main-Spiele ab (z.B. 5 von 11)
4. Verifiziere: Felder werden korrekt zugewiesen
5. Schließe restliche Quali-Spiele ab
6. Verifiziere: Platzhalter werden gefüllt

### Test-Szenario 3: Edge Cases
1. Ungerade Anzahl Gewinner (sollte nicht vorkommen)
2. Platzhalter fehlen (Datenbankproblem)
3. Qualification-Phase nicht gefunden

## SQL-Abfragen für Monitoring

### Überprüfe Platzhalter-Spiele
```sql
SELECT COUNT(*) as placeholder_count
FROM turnier_spiele
WHERE turnier_id = ? 
  AND phase_id = (SELECT id FROM turnier_phasen WHERE turnier_id = ? AND phase_name = 'Main Swiss')
  AND runde = 1
  AND status = 'wartend_quali';
```

### Überprüfe Qualification-Fortschritt
```sql
SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN status = 'beendet' THEN 1 ELSE 0 END) as completed,
    SUM(CASE WHEN gewinner_id IS NOT NULL THEN 1 ELSE 0 END) as with_winner
FROM turnier_spiele
WHERE turnier_id = ?
  AND phase_id = (SELECT id FROM turnier_phasen WHERE turnier_id = ? AND phase_name = 'Qualification')
  AND runde = 0;
```

### Überprüfe Main Swiss Runde 1 Status
```sql
SELECT 
    status,
    COUNT(*) as count,
    SUM(CASE WHEN feld_id IS NOT NULL THEN 1 ELSE 0 END) as with_field
FROM turnier_spiele
WHERE turnier_id = ?
  AND phase_id = (SELECT id FROM turnier_phasen WHERE turnier_id = ? AND phase_name = 'Main Swiss')
  AND runde = 1
GROUP BY status;
```

## Siehe auch

- `MIGRATION-Add-Wartend-Quali-Status.sql` - Datenbank-Migration
- `DYNAMIC-SWISS-PROGRESSION.md` - Dynamic Swiss System
- `SWISS_SYSTEM_README.md` - Swiss System Überblick
