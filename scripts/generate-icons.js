#!/usr/bin/env node
/**
 * OrTrack — Génération des icônes placeholder
 * Produit des PNG haute résolution à partir de SVG inline via sharp.
 *
 * Usage : node scripts/generate-icons.js
 */

const path = require('path');
const { execSync } = require('child_process');

const ASSETS = path.join(__dirname, '..', 'assets', 'images');

// ─── Palette ─────────────────────────────────────────────────────────────────
const BG   = '#1A1A2E';
const GOLD = '#C9A84C';
const WHITE = '#FFFFFF';

// ─── Générateur SVG ──────────────────────────────────────────────────────────
function makeSVG(size, transparent) {
  const half = size / 2;
  const radius = Math.round(size * 0.40);   // cercle doré
  const fontSize = Math.round(size * 0.30); // lettres "OT"

  // Légère ombre portée pour donner de la profondeur
  const shadow = `
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="${Math.round(size * 0.015)}"
                    stdDeviation="${Math.round(size * 0.02)}"
                    flood-color="#000000" flood-opacity="0.35"/>
    </filter>
  </defs>`;

  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  ${shadow}
  ${transparent ? '' : `<rect width="${size}" height="${size}" fill="${BG}" rx="${Math.round(size * 0.18)}"/>`}
  <circle cx="${half}" cy="${half}" r="${radius}"
          fill="${GOLD}" filter="url(#shadow)"/>
  <text
    x="${half}" y="${half}"
    font-family="'Arial Black', 'Helvetica Neue', Arial, sans-serif"
    font-weight="900"
    font-size="${fontSize}"
    fill="${WHITE}"
    text-anchor="middle"
    dominant-baseline="central"
    letter-spacing="${Math.round(size * -0.004)}">OT</text>
</svg>`;
}

// ─── Fichiers à générer ───────────────────────────────────────────────────────
const FILES = [
  {
    name: 'icon.png',
    size: 1024,
    transparent: false,
    desc: 'Icône app (iOS + Android)',
  },
  {
    name: 'splash-icon.png',
    size: 512,
    transparent: false,
    desc: 'Splash screen',
  },
  {
    name: 'adaptive-icon.png',
    size: 1024,
    transparent: true,
    desc: 'Adaptive icon Android (foreground)',
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // Tente de charger sharp, l'installe si absent
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    console.log('📦  sharp introuvable — installation en cours (dev only)…');
    execSync('npm install --save-dev sharp', { stdio: 'inherit' });
    sharp = require('sharp');
  }

  console.log('\n🎨  Génération des icônes OrTrack\n');

  for (const file of FILES) {
    const svg = Buffer.from(makeSVG(file.size, file.transparent), 'utf8');
    const dest = path.join(ASSETS, file.name);

    await sharp(svg)
      .png({ compressionLevel: 9 })
      .toFile(dest);

    console.log(`  ✓  ${file.name.padEnd(24)} ${file.size}×${file.size}  —  ${file.desc}`);
  }

  console.log('\n✅  Toutes les icônes sont prêtes dans assets/images/\n');
}

main().catch((err) => {
  console.error('\n❌  Erreur :', err.message);
  process.exit(1);
});
