import * as fs from 'fs';
import * as path from 'path';
import { Position } from '@/types/position';
import { buildSynthesePatrimonialeHtml } from '../html-builder';

const ISO = '2026-05-09T12:00:00.000Z';

const PRICES = {
  gold: 2000,
  silver: 25,
  platinum: 900,
  palladium: 1100,
  lastUpdated: '2026-05-09T12:00:00.000Z',
  currencySymbol: '€',
};

function makePos(over: Partial<Position> & { id: string }): Position {
  return {
    metal: 'or',
    product: `Produit ${over.id}`,
    weightG: 31.1035,
    quantity: 1,
    purchasePrice: 1500,
    purchaseDate: '01/01/2024',
    createdAt: '2024-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('buildSynthesePatrimonialeHtml', () => {
  test('1 — génère un HTML complet', () => {
    const html = buildSynthesePatrimonialeHtml({
      positions: [],
      prices: PRICES,
      generatedAtIso: ISO,
      maskSensitiveValues: false,
    });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
    expect(html).toContain('<head>');
    expect(html).toContain('<body>');
  });

  test('2 — contient le titre figé', () => {
    const html = buildSynthesePatrimonialeHtml({
      positions: [],
      prices: PRICES,
      generatedAtIso: ISO,
      maskSensitiveValues: false,
    });
    expect(html).toContain('Synthèse patrimoniale indicative');
  });

  test('3 — date FR JJ/MM/AAAA depuis ISO', () => {
    const html = buildSynthesePatrimonialeHtml({
      positions: [],
      prices: PRICES,
      generatedAtIso: ISO,
      maskSensitiveValues: false,
    });
    expect(html).toContain('Synthèse au 09/05/2026');
  });

  test('4 — contient Document indicatif', () => {
    const html = buildSynthesePatrimonialeHtml({
      positions: [],
      prices: PRICES,
      generatedAtIso: ISO,
      maskSensitiveValues: false,
    });
    expect(html).toContain('Document indicatif');
  });

  test('5 — contient le disclaimer exact', () => {
    const html = buildSynthesePatrimonialeHtml({
      positions: [],
      prices: PRICES,
      generatedAtIso: ISO,
      maskSensitiveValues: false,
    });
    expect(html).toContain('Document généré à partir des données saisies dans OrTrack.');
    expect(html).toContain('Ne constitue pas un document officiel, un conseil fiscal,');
    expect(html).toContain('ni un document successoral.');
    expect(html).toContain('Les valeurs indicatives sont basées sur le cours du jour de');
    expect(html).toContain('génération et les données saisies par');
    expect(html).toContain('utilisateur.');
  });

  test('6 — trie par métal puis date', () => {
    const positions = [
      makePos({ id: 'p1', metal: 'platine', product: 'PT-OLD', purchaseDate: '01/01/2020' }),
      makePos({ id: 'p2', metal: 'or', product: 'OR-NEW', purchaseDate: '01/01/2025' }),
      makePos({ id: 'p3', metal: 'argent', product: 'AG-MID', purchaseDate: '01/01/2023' }),
      makePos({ id: 'p4', metal: 'or', product: 'OR-OLD', purchaseDate: '01/01/2020' }),
    ];
    const html = buildSynthesePatrimonialeHtml({
      positions,
      prices: PRICES,
      generatedAtIso: ISO,
      maskSensitiveValues: false,
    });
    const idx = (s: string) => html.indexOf(s);
    expect(idx('OR-OLD')).toBeGreaterThan(-1);
    expect(idx('OR-OLD')).toBeLessThan(idx('OR-NEW'));
    expect(idx('OR-NEW')).toBeLessThan(idx('AG-MID'));
    expect(idx('AG-MID')).toBeLessThan(idx('PT-OLD'));
  });

  test('7 — dates invalides placées en fin de métal', () => {
    const positions = [
      makePos({ id: 'p1', metal: 'or', product: 'OR-INVALID', purchaseDate: 'foo' }),
      makePos({ id: 'p2', metal: 'or', product: 'OR-VALID', purchaseDate: '01/01/2020' }),
    ];
    const html = buildSynthesePatrimonialeHtml({
      positions,
      prices: PRICES,
      generatedAtIso: ISO,
      maskSensitiveValues: false,
    });
    expect(html.indexOf('OR-VALID')).toBeLessThan(html.indexOf('OR-INVALID'));
  });

  test('8 — métal inconnu placé après palladium', () => {
    const positions = [
      makePos({ id: 'p1', metal: 'palladium', product: 'PD-X' }),
      makePos({ id: 'p2', metal: 'rhodium' as Position['metal'], product: 'UNKNOWN-X' }),
    ];
    const html = buildSynthesePatrimonialeHtml({
      positions,
      prices: PRICES,
      generatedAtIso: ISO,
      maskSensitiveValues: false,
    });
    expect(html.indexOf('PD-X')).toBeLessThan(html.indexOf('UNKNOWN-X'));
  });

  test('9 — affiche Non disponible si net vendeur absent', () => {
    const html = buildSynthesePatrimonialeHtml({
      positions: [],
      prices: PRICES,
      generatedAtIso: ISO,
      maskSensitiveValues: false,
    });
    expect(html).toMatch(/Net vendeur indicatif total<\/dt><dd>Non disponible<\/dd>/);
  });

  test('10 — masque les montants si maskSensitiveValues=true', () => {
    const positions = [makePos({ id: 'p1', purchasePrice: 1500 })];
    const html = buildSynthesePatrimonialeHtml({
      positions,
      prices: PRICES,
      generatedAtIso: ISO,
      maskSensitiveValues: true,
      fiscal: { netVendeur: 1234 },
    });
    expect(html).not.toMatch(/1 500,00/);
    expect(html).not.toMatch(/1 234,00/);
    expect(html).toContain('••••••');
  });

  test('11 — masque les pourcentages financiers si maskSensitiveValues=true', () => {
    const positions = [
      makePos({ id: 'p1', metal: 'or' }),
      makePos({ id: 'p2', metal: 'argent' }),
    ];
    const html = buildSynthesePatrimonialeHtml({
      positions,
      prices: PRICES,
      generatedAtIso: ISO,
      maskSensitiveValues: true,
    });
    expect(html).not.toMatch(/\d+ %/);
  });

  test("12 — masque produit, quantité, poids et date d'achat", () => {
    const positions = [
      makePos({
        id: 'p1',
        product: 'Krugerrand 1oz',
        purchaseDate: '15/03/2024',
        weightG: 31.1035,
      }),
    ];
    const html = buildSynthesePatrimonialeHtml({
      positions,
      prices: PRICES,
      generatedAtIso: ISO,
      maskSensitiveValues: true,
    });
    expect(html).not.toContain('Krugerrand');
    expect(html).not.toContain('15/03/2024');
    expect(html).not.toContain('31,10 g');
  });

  test('13 — affiche les détails complets si maskSensitiveValues=false', () => {
    const positions = [
      makePos({
        id: 'p1',
        product: 'Krugerrand 1oz',
        purchaseDate: '15/03/2024',
        purchasePrice: 1500,
        weightG: 31.1035,
      }),
    ];
    const html = buildSynthesePatrimonialeHtml({
      positions,
      prices: PRICES,
      generatedAtIso: ISO,
      maskSensitiveValues: false,
    });
    expect(html).toContain('Krugerrand');
    expect(html).toContain('15/03/2024');
  });

  test('14 — affiche la répartition par métal', () => {
    const positions = [makePos({ id: 'p1', metal: 'or' })];
    const html = buildSynthesePatrimonialeHtml({
      positions,
      prices: PRICES,
      generatedAtIso: ISO,
      maskSensitiveValues: false,
    });
    expect(html).toMatch(/Or 100 %/);
  });

  test('15 — affiche seulement les métaux présents si valeurs indisponibles', () => {
    const positions = [makePos({ id: 'p1', metal: 'or' })];
    const pricesNoSpot = {
      gold: null,
      silver: null,
      platinum: null,
      palladium: null,
      lastUpdated: null,
      currencySymbol: '€',
    };
    const html = buildSynthesePatrimonialeHtml({
      positions,
      prices: pricesNoSpot,
      generatedAtIso: ISO,
      maskSensitiveValues: false,
    });
    expect(html).toContain('Métaux présents');
    expect(html).toContain('Or');
    // Ne doit pas afficher de pourcentage de répartition.
    expect(html).not.toMatch(/Or \d+ %/);
  });

  test('16 — gère un portefeuille vide sans crash', () => {
    const html = buildSynthesePatrimonialeHtml({
      positions: [],
      prices: PRICES,
      generatedAtIso: ISO,
      maskSensitiveValues: false,
    });
    expect(html).toContain('Synthèse patrimoniale indicative');
    expect(html).toContain('Document indicatif');
    expect(html).toContain('Aucune position');
  });

  test('17 — ne mute pas les positions en entrée', () => {
    const positions = [
      makePos({ id: 'p1', metal: 'palladium' }),
      makePos({ id: 'p2', metal: 'or' }),
    ];
    const snapshot = JSON.parse(JSON.stringify(positions));
    buildSynthesePatrimonialeHtml({
      positions,
      prices: PRICES,
      generatedAtIso: ISO,
      maskSensitiveValues: false,
    });
    expect(positions).toEqual(snapshot);
  });

  test('18 — contient page-break-inside', () => {
    const html = buildSynthesePatrimonialeHtml({
      positions: [],
      prices: PRICES,
      generatedAtIso: ISO,
      maskSensitiveValues: false,
    });
    expect(html).toContain('page-break-inside');
  });

  test("19 — builder n'importe pas expo-print ni expo-sharing", () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../html-builder.ts'), 'utf8');
    expect(src).not.toMatch(/expo-print/);
    expect(src).not.toMatch(/expo-sharing/);
  });

  test("20 — builder n'importe pas AsyncStorage, Supabase, RevenueCat, FileSystem", () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../html-builder.ts'), 'utf8');
    expect(src).not.toMatch(/AsyncStorage|async-storage/i);
    expect(src).not.toMatch(/supabase/i);
    expect(src).not.toMatch(/revenuecat|react-native-purchases/i);
    expect(src).not.toMatch(/FileSystem|expo-file-system/i);
  });

  test("21 — builder n'appelle pas Date.now()", () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../html-builder.ts'), 'utf8');
    expect(src).not.toMatch(/Date\.now\s*\(/);
  });

  test('22 — échappe <script> dans un produit', () => {
    const positions = [makePos({ id: 'p1', product: '<script>alert(1)</script>' })];
    const html = buildSynthesePatrimonialeHtml({
      positions,
      prices: PRICES,
      generatedAtIso: ISO,
      maskSensitiveValues: false,
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('23 — échappe &, ", \' dans un produit', () => {
    const positions = [makePos({ id: 'p1', product: 'A & B "C" \'D\'' })];
    const html = buildSynthesePatrimonialeHtml({
      positions,
      prices: PRICES,
      generatedAtIso: ISO,
      maskSensitiveValues: false,
    });
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;');
    expect(html).toContain('&#39;');
  });

  test('24 — échappe regimeLabel fourni dans fiscal', () => {
    const html = buildSynthesePatrimonialeHtml({
      positions: [],
      prices: PRICES,
      generatedAtIso: ISO,
      maskSensitiveValues: false,
      fiscal: { regimeLabel: '<b>Forfait</b>' },
    });
    expect(html).not.toContain('<b>Forfait</b>');
    expect(html).toContain('&lt;b&gt;Forfait&lt;/b&gt;');
  });

  test('25 — échappe currencySymbol', () => {
    const html = buildSynthesePatrimonialeHtml({
      positions: [makePos({ id: 'p1' })],
      prices: { ...PRICES, currencySymbol: '<€>' },
      generatedAtIso: ISO,
      maskSensitiveValues: false,
    });
    expect(html).not.toContain('<€>');
    expect(html).toContain('&lt;€&gt;');
  });
});
