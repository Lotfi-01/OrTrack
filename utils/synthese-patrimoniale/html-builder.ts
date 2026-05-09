import { Position } from '@/types/position';
import { type MetalType, getSpot } from '@/constants/metals';
import {
  formatEuro,
  formatGain,
  formatQty,
  formatG,
  getDisplayPositionName,
  METAL_DISPLAY_WORDS,
} from '@/utils/format';
import { computePositionValue, computePositionCost } from '@/utils/position-calc';
import { parseDate } from '@/utils/tax-helpers';

// ─── Types ──────────────────────────────────────────────────────────────────

export type SynthesePrices = {
  gold?: number | null;
  silver?: number | null;
  platinum?: number | null;
  palladium?: number | null;
  lastUpdated?: string | null;
  currencySymbol?: string | null;
};

export type SyntheseFiscal = {
  netVendeur?: number | null;
  regimeLabel?: string | null;
};

export type SynthesePatrimonialeInput = {
  positions: Position[];
  prices: SynthesePrices;
  generatedAtIso: string;
  referenceId?: string;
  maskSensitiveValues: boolean;
  fiscal?: SyntheseFiscal;
};

// ─── Constantes ─────────────────────────────────────────────────────────────

const METAL_ORDER: MetalType[] = ['or', 'argent', 'platine', 'palladium'];
const KNOWN_METALS = new Set<string>(METAL_ORDER);
const MASK = '••••••';
const WATERMARK = 'Document indicatif';
const NON_DISPONIBLE = 'Non disponible';

// Disclaimer texte exact figé. [À vérifier avec juriste]
const DISCLAIMER_TEXT =
  "Document généré à partir des données saisies dans OrTrack.\n" +
  "Ne constitue pas un document officiel, un conseil fiscal,\n" +
  "ni un document successoral.\n" +
  "Les valeurs indicatives sont basées sur le cours du jour de\n" +
  "génération et les données saisies par l'utilisateur.";

const SPOT_KEY_BY_METAL: Record<MetalType, 'gold' | 'silver' | 'platinum' | 'palladium'> = {
  or: 'gold',
  argent: 'silver',
  platine: 'platinum',
  palladium: 'palladium',
};

// ─── Helpers locaux ─────────────────────────────────────────────────────────

/**
 * Échappement HTML strict.
 * Ordre figé : & < > " '
 */
function escapeHtml(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseIso(iso: string | null | undefined): Date | null {
  if (typeof iso !== 'string' || iso.trim() === '') return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function formatDDMMYYYYFromDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatDateForHeader(iso: string): string {
  const d = parseIso(iso);
  return d ? formatDDMMYYYYFromDate(d) : NON_DISPONIBLE;
}

function buildReferenceFromIso(iso: string): string {
  const d = parseIso(iso);
  if (!d) return 'OT-INDISPONIBLE';
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `OT-${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function metalRank(metal: string): number {
  const idx = METAL_ORDER.indexOf(metal as MetalType);
  return idx === -1 ? METAL_ORDER.length : idx;
}

function safeMetalLabel(metal: string): string {
  if (KNOWN_METALS.has(metal)) {
    return METAL_DISPLAY_WORDS[metal as MetalType];
  }
  return escapeHtml(metal);
}

function formatPctInt(pct: number): string {
  return `${Math.round(pct)} %`;
}

function formatGainText(value: number): string {
  return formatGain(value).text;
}

// ─── Tri positions ──────────────────────────────────────────────────────────

function sortPositions(positions: Position[]): Position[] {
  // Copie : ne mute pas l'input.
  return [...positions].sort((a, b) => {
    const rankDiff = metalRank(a.metal) - metalRank(b.metal);
    if (rankDiff !== 0) return rankDiff;

    const da = parseDate(a.purchaseDate);
    const db = parseDate(b.purchaseDate);

    // Dates invalides en fin de métal.
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;

    return da.getTime() - db.getTime();
  });
}

// ─── Sections ───────────────────────────────────────────────────────────────

function renderHeader(input: SynthesePatrimonialeInput): string {
  return `
    <header class="header">
      <div class="brand">OrTrack</div>
      <h1 class="title">Synthèse patrimoniale indicative</h1>
      <div class="generated-at">Synthèse au ${escapeHtml(formatDateForHeader(input.generatedAtIso))}</div>
    </header>
  `;
}

function renderOverview(input: SynthesePatrimonialeInput): string {
  const { positions, prices, maskSensitiveValues, fiscal } = input;
  const currency = escapeHtml(prices.currencySymbol ?? '€');

  // Valeur totale + répartition : nécessite spots dispo pour chaque métal présent.
  const presentMetals: string[] = [];
  for (const m of METAL_ORDER) {
    if (positions.some(p => p.metal === m)) presentMetals.push(m);
  }
  // Métaux inconnus présents : ajoutés aussi à la liste des métaux présents (en fin).
  for (const p of positions) {
    if (!KNOWN_METALS.has(p.metal) && !presentMetals.includes(p.metal)) {
      presentMetals.push(p.metal);
    }
  }

  // Calcul valeur totale et par métal — uniquement pour métaux connus avec spot.
  const valueByMetal = new Map<string, number>();
  let totalValue = 0;
  let totalCost = 0;
  let canCompute = true;

  for (const pos of positions) {
    if (!KNOWN_METALS.has(pos.metal)) {
      canCompute = false;
      continue;
    }
    const spot = getSpot(pos.metal as MetalType, prices as Parameters<typeof getSpot>[1]);
    const v = computePositionValue(pos, spot);
    if (v === null) {
      canCompute = false;
      continue;
    }
    valueByMetal.set(pos.metal, (valueByMetal.get(pos.metal) ?? 0) + v);
    totalValue += v;
    totalCost += computePositionCost(pos);
  }

  const gain = totalValue - totalCost;
  const positionsCount = positions.length;
  const netVendeur = fiscal?.netVendeur;

  const repartitionFallback = positions.length === 0
    ? '<span class="muted">Aucune position</span>'
    : `Métaux présents : ${presentMetals.map(m => escapeHtml(safeMetalLabel(m))).join(', ')}`;

  let repartitionHtml: string;
  if (maskSensitiveValues) {
    // Privacy : seulement noms des métaux présents.
    repartitionHtml = positions.length === 0
      ? '<span class="muted">Aucune position</span>'
      : presentMetals.map(m => escapeHtml(safeMetalLabel(m))).join(' · ');
  } else if (canCompute && totalValue > 0) {
    const parts: string[] = [];
    for (const m of presentMetals) {
      const v = valueByMetal.get(m) ?? 0;
      const pct = (v / totalValue) * 100;
      parts.push(`${escapeHtml(safeMetalLabel(m))} ${formatPctInt(pct)}`);
    }
    repartitionHtml = parts.join(' · ');
  } else {
    repartitionHtml = repartitionFallback;
  }

  const totalValueText = maskSensitiveValues
    ? MASK
    : (canCompute && positions.length > 0)
      ? `${formatEuro(totalValue)} ${currency}`
      : NON_DISPONIBLE;

  const gainText = maskSensitiveValues
    ? MASK
    : (canCompute && positions.length > 0)
      ? `${formatGainText(gain)} ${currency}`
      : NON_DISPONIBLE;

  let netVendeurText: string;
  if (maskSensitiveValues) {
    netVendeurText = MASK;
  } else if (typeof netVendeur === 'number' && Number.isFinite(netVendeur)) {
    netVendeurText = `${formatEuro(netVendeur)} ${currency}`;
  } else {
    netVendeurText = NON_DISPONIBLE;
  }

  return `
    <section class="section overview">
      <h2>Vue d'ensemble</h2>
      <dl class="kv">
        <dt>Valeur totale indicative</dt><dd>${totalValueText}</dd>
        <dt>Nombre de positions</dt><dd>${positionsCount}</dd>
        <dt>Répartition par métal</dt><dd>${repartitionHtml}</dd>
        <dt>Plus-value estimée totale</dt><dd>${gainText}</dd>
        <dt>Net vendeur indicatif total</dt><dd>${netVendeurText}</dd>
      </dl>
    </section>
  `;
}

function renderPositionRow(pos: Position, prices: SynthesePrices, mask: boolean, currency: string): string {
  const metalDisplay = escapeHtml(safeMetalLabel(pos.metal));

  const purchaseDateLabel = (() => {
    if (mask) return MASK;
    const d = parseDate(pos.purchaseDate);
    if (d === null) return escapeHtml(pos.purchaseDate ?? '');
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  })();

  const productLabel = mask
    ? MASK
    : escapeHtml(getDisplayPositionName({ metal: pos.metal, product: pos.product }));

  const quantityLabel = mask ? MASK : escapeHtml(formatQty(pos.quantity));
  const weightLabel = mask ? MASK : escapeHtml(formatG(pos.weightG));

  const purchasePriceLabel = mask
    ? MASK
    : Number.isFinite(pos.purchasePrice) && pos.purchasePrice > 0
      ? `${formatEuro(pos.purchasePrice)} ${currency}`
      : NON_DISPONIBLE;

  const isKnownMetal = KNOWN_METALS.has(pos.metal);
  const spot = isKnownMetal
    ? getSpot(pos.metal as MetalType, prices as Parameters<typeof getSpot>[1])
    : null;
  const value = isKnownMetal ? computePositionValue(pos, spot) : null;
  const cost = computePositionCost(pos);
  const gain = value !== null ? value - cost : null;

  const valueLabel = mask
    ? MASK
    : value !== null
      ? `${formatEuro(value)} ${currency}`
      : NON_DISPONIBLE;

  const gainLabel = mask
    ? MASK
    : gain !== null
      ? `${formatGainText(gain)} ${currency}`
      : NON_DISPONIBLE;

  return `
    <article class="pos">
      <div class="pos-head">
        <span class="pos-metal">${metalDisplay}</span>
        <span class="pos-product">${productLabel}</span>
      </div>
      <dl class="pos-kv">
        <dt>Quantité</dt><dd>${quantityLabel}</dd>
        <dt>Poids</dt><dd>${weightLabel}</dd>
        <dt>Date d'achat</dt><dd>${purchaseDateLabel}</dd>
        <dt>Prix d'achat</dt><dd>${purchasePriceLabel}</dd>
        <dt>Valeur indicative actuelle</dt><dd>${valueLabel}</dd>
        <dt>Plus-value estimée</dt><dd>${gainLabel}</dd>
      </dl>
    </article>
  `;
}

function renderPositions(input: SynthesePatrimonialeInput): string {
  const { prices, maskSensitiveValues } = input;
  const currency = escapeHtml(prices.currencySymbol ?? '€');
  const sorted = sortPositions(input.positions);

  if (sorted.length === 0) {
    return `
      <section class="section positions">
        <h2>Détail des positions</h2>
        <p class="muted">Aucune position.</p>
      </section>
    `;
  }

  const rows = sorted.map(p => renderPositionRow(p, prices, maskSensitiveValues, currency)).join('\n');
  return `
    <section class="section positions">
      <h2>Détail des positions</h2>
      ${rows}
    </section>
  `;
}

function renderHypotheses(input: SynthesePatrimonialeInput): string {
  const { prices, fiscal } = input;
  const currency = escapeHtml(prices.currencySymbol ?? '€');

  const lastUpdatedDate = parseIso(prices.lastUpdated ?? null);
  const lastUpdatedLabel = lastUpdatedDate
    ? formatDDMMYYYYFromDate(lastUpdatedDate)
    : NON_DISPONIBLE;

  const spotLines: string[] = [];
  for (const m of METAL_ORDER) {
    const spot = prices[SPOT_KEY_BY_METAL[m]];
    const label = METAL_DISPLAY_WORDS[m];
    const valueText =
      typeof spot === 'number' && Number.isFinite(spot)
        ? `${formatEuro(spot)} ${currency}`
        : NON_DISPONIBLE;
    spotLines.push(`<li><strong>${escapeHtml(label)}</strong> : ${valueText}</li>`);
  }

  const regimeLabel = fiscal?.regimeLabel;
  const regimeText =
    typeof regimeLabel === 'string' && regimeLabel.trim() !== ''
      ? `Régime fiscal : ${escapeHtml(regimeLabel)}`
      : `Régime fiscal : ${NON_DISPONIBLE}`;

  return `
    <section class="section hypotheses">
      <h2>Hypothèses utilisées</h2>
      <p>Cours pris en compte (${escapeHtml(lastUpdatedLabel)}) :</p>
      <ul class="spots">${spotLines.join('')}</ul>
      <p>${regimeText}</p>
      <p class="muted">Valeurs indicatives, susceptibles d'évoluer.</p>
    </section>
  `;
}

function renderDisclaimer(): string {
  // [À vérifier avec juriste]
  return `
    <section class="section disclaimer">
      <h2>Avertissement</h2>
      <p>${escapeHtml(DISCLAIMER_TEXT).replace(/\n/g, '<br/>')}</p>
    </section>
  `;
}

function renderFooter(reference: string): string {
  return `
    <footer class="footer">
      <div class="reference">Référence : ${escapeHtml(reference)}</div>
      <div class="watermark-footer">${WATERMARK}</div>
    </footer>
  `;
}

function renderStyles(): string {
  return `
    <style>
      :root {
        --ink: #1a1a1a;
        --muted: #555;
        --rule: #cfcfcf;
        --gold: #8a6e1f;
        --bg: #ffffff;
      }
      @page { size: A4; margin: 16mm; }
      * { box-sizing: border-box; }
      html, body {
        margin: 0; padding: 0; background: var(--bg); color: var(--ink);
        font-family: "Helvetica", "Arial", sans-serif; font-size: 11pt; line-height: 1.45;
      }
      body { position: relative; padding: 0; }
      .watermark {
        position: fixed; inset: 0;
        display: flex; align-items: center; justify-content: center;
        pointer-events: none; z-index: 0;
      }
      .watermark span {
        transform: rotate(-30deg);
        font-size: 64pt; color: rgba(0,0,0,0.06);
        letter-spacing: 0.08em; text-transform: uppercase;
      }
      .page { position: relative; z-index: 1; padding: 8mm 0; }
      .header { border-bottom: 1px solid var(--rule); padding-bottom: 8mm; margin-bottom: 8mm; }
      .brand { color: var(--gold); font-size: 10pt; letter-spacing: 0.1em; text-transform: uppercase; }
      .title { font-size: 18pt; margin: 4mm 0 2mm 0; color: var(--ink); }
      .generated-at { color: var(--muted); font-size: 10pt; }
      h2 { font-size: 12pt; color: var(--ink); border-bottom: 1px solid var(--rule); padding-bottom: 2mm; margin: 6mm 0 4mm 0; }
      .section { page-break-inside: avoid; margin-bottom: 6mm; }
      .kv, .pos-kv {
        display: grid; grid-template-columns: 1fr 1fr; gap: 1mm 4mm; margin: 0;
      }
      .kv dt, .pos-kv dt { color: var(--muted); }
      .kv dd, .pos-kv dd { margin: 0; color: var(--ink); }
      .pos {
        page-break-inside: avoid;
        border: 1px solid var(--rule); border-radius: 2mm;
        padding: 3mm 4mm; margin-bottom: 3mm;
      }
      .pos-head { display: flex; align-items: baseline; gap: 4mm; margin-bottom: 2mm; }
      .pos-metal { color: var(--gold); text-transform: uppercase; font-size: 9pt; letter-spacing: 0.08em; }
      .pos-product { font-weight: 600; }
      .spots { margin: 0 0 3mm 0; padding-left: 5mm; }
      .muted { color: var(--muted); }
      .disclaimer p { color: var(--muted); font-size: 10pt; }
      .footer {
        margin-top: 8mm; padding-top: 4mm; border-top: 1px solid var(--rule);
        display: flex; justify-content: space-between; font-size: 9pt; color: var(--muted);
      }
      .watermark-footer { letter-spacing: 0.05em; text-transform: uppercase; }
    </style>
  `;
}

// ─── Builder principal ──────────────────────────────────────────────────────

export function buildSynthesePatrimonialeHtml(input: SynthesePatrimonialeInput): string {
  const reference = input.referenceId && input.referenceId.trim() !== ''
    ? input.referenceId
    : buildReferenceFromIso(input.generatedAtIso);

  const body = `
    <div class="watermark" aria-hidden="true"><span>${WATERMARK}</span></div>
    <main class="page">
      ${renderHeader(input)}
      ${renderOverview(input)}
      ${renderPositions(input)}
      ${renderHypotheses(input)}
      ${renderDisclaimer()}
      ${renderFooter(reference)}
    </main>
  `;

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Synthèse patrimoniale indicative</title>
${renderStyles()}
</head>
<body>
${body}
</body>
</html>`;
}
