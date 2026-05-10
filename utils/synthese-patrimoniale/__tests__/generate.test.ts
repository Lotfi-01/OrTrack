import * as fs from 'fs';
import * as path from 'path';

jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn(),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));
jest.mock('../html-builder', () => ({
  buildSynthesePatrimonialeHtml: jest.fn(),
}));

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { buildSynthesePatrimonialeHtml, SynthesePatrimonialeInput } from '../html-builder';
import { generateAndShareSynthesePatrimoniale } from '../generate';

const mockIsAvailable = Sharing.isAvailableAsync as jest.Mock;
const mockShareAsync = Sharing.shareAsync as jest.Mock;
const mockPrintToFile = Print.printToFileAsync as jest.Mock;
const mockBuilder = buildSynthesePatrimonialeHtml as unknown as jest.Mock;

const FAKE_INPUT: SynthesePatrimonialeInput = {
  positions: [],
  prices: { gold: 2000, currencySymbol: '€' },
  generatedAtIso: '2026-05-09T12:00:00.000Z',
  maskSensitiveValues: false,
};

beforeEach(() => {
  mockIsAvailable.mockReset();
  mockShareAsync.mockReset();
  mockPrintToFile.mockReset();
  mockBuilder.mockReset();
});

describe('generateAndShareSynthesePatrimoniale — runtime', () => {
  test('1 — vérifie isAvailableAsync avant toute génération', async () => {
    mockIsAvailable.mockResolvedValueOnce(false);
    await generateAndShareSynthesePatrimoniale(FAKE_INPUT);
    expect(mockIsAvailable).toHaveBeenCalledTimes(1);
  });

  test('2 — retourne unavailable si partage indisponible', async () => {
    mockIsAvailable.mockResolvedValueOnce(false);
    const result = await generateAndShareSynthesePatrimoniale(FAKE_INPUT);
    expect(result).toEqual({ status: 'unavailable', reason: 'sharing_unavailable' });
  });

  test('3 — ne génère pas le HTML si partage indisponible', async () => {
    mockIsAvailable.mockResolvedValueOnce(false);
    await generateAndShareSynthesePatrimoniale(FAKE_INPUT);
    expect(mockBuilder).not.toHaveBeenCalled();
  });

  test('4 — ne génère pas le PDF si partage indisponible', async () => {
    mockIsAvailable.mockResolvedValueOnce(false);
    await generateAndShareSynthesePatrimoniale(FAKE_INPUT);
    expect(mockPrintToFile).not.toHaveBeenCalled();
  });

  test("5 — n'appelle pas shareAsync si partage indisponible", async () => {
    mockIsAvailable.mockResolvedValueOnce(false);
    await generateAndShareSynthesePatrimoniale(FAKE_INPUT);
    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  test('6 — failed/sharing_check_failed si isAvailableAsync throw', async () => {
    mockIsAvailable.mockRejectedValueOnce(new Error('native fail'));
    const result = await generateAndShareSynthesePatrimoniale(FAKE_INPUT);
    expect(result).toEqual({ status: 'failed', reason: 'sharing_check_failed' });
    expect(mockBuilder).not.toHaveBeenCalled();
    expect(mockPrintToFile).not.toHaveBeenCalled();
    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  test("7 — appelle le builder avec l'input fourni si partage disponible", async () => {
    mockIsAvailable.mockResolvedValueOnce(true);
    mockBuilder.mockReturnValueOnce('<html>ok</html>');
    mockPrintToFile.mockResolvedValueOnce({ uri: 'file:///tmp/synth.pdf' });
    mockShareAsync.mockResolvedValueOnce(undefined);
    await generateAndShareSynthesePatrimoniale(FAKE_INPUT);
    expect(mockBuilder).toHaveBeenCalledTimes(1);
    expect(mockBuilder).toHaveBeenCalledWith(FAKE_INPUT);
  });

  test('8 — failed/html_generation_failed si le builder throw', async () => {
    mockIsAvailable.mockResolvedValueOnce(true);
    mockBuilder.mockImplementationOnce(() => {
      throw new Error('builder boom');
    });
    const result = await generateAndShareSynthesePatrimoniale(FAKE_INPUT);
    expect(result).toEqual({ status: 'failed', reason: 'html_generation_failed' });
    expect(mockPrintToFile).not.toHaveBeenCalled();
    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  test('9 — failed/html_generation_failed si le builder retourne string vide', async () => {
    mockIsAvailable.mockResolvedValueOnce(true);
    mockBuilder.mockReturnValueOnce('');
    const result = await generateAndShareSynthesePatrimoniale(FAKE_INPUT);
    expect(result).toEqual({ status: 'failed', reason: 'html_generation_failed' });
    expect(mockPrintToFile).not.toHaveBeenCalled();
    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  test('10 — appelle Print.printToFileAsync avec le HTML généré', async () => {
    mockIsAvailable.mockResolvedValueOnce(true);
    mockBuilder.mockReturnValueOnce('<html>generated</html>');
    mockPrintToFile.mockResolvedValueOnce({ uri: 'file:///tmp/x.pdf' });
    mockShareAsync.mockResolvedValueOnce(undefined);
    await generateAndShareSynthesePatrimoniale(FAKE_INPUT);
    expect(mockPrintToFile).toHaveBeenCalledTimes(1);
    expect(mockPrintToFile).toHaveBeenCalledWith({ html: '<html>generated</html>' });
  });

  test("11 — failed/pdf_generation_failed si printToFileAsync ne retourne pas d'URI", async () => {
    mockIsAvailable.mockResolvedValueOnce(true);
    mockBuilder.mockReturnValueOnce('<html>ok</html>');
    mockPrintToFile.mockResolvedValueOnce({ uri: '' });
    const result = await generateAndShareSynthesePatrimoniale(FAKE_INPUT);
    expect(result).toEqual({ status: 'failed', reason: 'pdf_generation_failed' });
    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  test('12 — failed/pdf_generation_failed si printToFileAsync throw', async () => {
    mockIsAvailable.mockResolvedValueOnce(true);
    mockBuilder.mockReturnValueOnce('<html>ok</html>');
    mockPrintToFile.mockRejectedValueOnce(new Error('printer down'));
    const result = await generateAndShareSynthesePatrimoniale(FAKE_INPUT);
    expect(result).toEqual({ status: 'failed', reason: 'pdf_generation_failed' });
    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  test('13 — appelle et attend shareAsync via promesse différée', async () => {
    mockIsAvailable.mockResolvedValueOnce(true);
    mockBuilder.mockReturnValueOnce('<html>ok</html>');
    mockPrintToFile.mockResolvedValueOnce({ uri: 'file:///tmp/y.pdf' });

    let resolveShare: (() => void) | null = null;
    const sharePromise = new Promise<void>(r => {
      resolveShare = r;
    });
    mockShareAsync.mockReturnValueOnce(sharePromise);

    let resolved = false;
    const opPromise = generateAndShareSynthesePatrimoniale(FAKE_INPUT).then(r => {
      resolved = true;
      return r;
    });

    // Laisser la chaîne progresser jusqu'à l'await sur shareAsync.
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
    expect(mockShareAsync).toHaveBeenCalledTimes(1);
    expect(resolved).toBe(false);

    resolveShare!();
    const r = await opPromise;
    expect(r).toEqual({ status: 'shared' });
  });

  test('14 — passe mimeType: application/pdf à shareAsync', async () => {
    mockIsAvailable.mockResolvedValueOnce(true);
    mockBuilder.mockReturnValueOnce('<html>ok</html>');
    mockPrintToFile.mockResolvedValueOnce({ uri: 'file:///tmp/z.pdf' });
    mockShareAsync.mockResolvedValueOnce(undefined);
    await generateAndShareSynthesePatrimoniale(FAKE_INPUT);
    expect(mockShareAsync).toHaveBeenCalledWith(
      'file:///tmp/z.pdf',
      expect.objectContaining({ mimeType: 'application/pdf' }),
    );
  });

  test('15 — passe dialogTitle exact à shareAsync', async () => {
    mockIsAvailable.mockResolvedValueOnce(true);
    mockBuilder.mockReturnValueOnce('<html>ok</html>');
    mockPrintToFile.mockResolvedValueOnce({ uri: 'file:///tmp/z.pdf' });
    mockShareAsync.mockResolvedValueOnce(undefined);
    await generateAndShareSynthesePatrimoniale(FAKE_INPUT);
    expect(mockShareAsync).toHaveBeenCalledWith(
      'file:///tmp/z.pdf',
      expect.objectContaining({ dialogTitle: 'Partager la synthèse patrimoniale' }),
    );
  });

  test('16 — retourne { status: shared } si tout réussit', async () => {
    mockIsAvailable.mockResolvedValueOnce(true);
    mockBuilder.mockReturnValueOnce('<html>ok</html>');
    mockPrintToFile.mockResolvedValueOnce({ uri: 'file:///tmp/done.pdf' });
    mockShareAsync.mockResolvedValueOnce(undefined);
    const r = await generateAndShareSynthesePatrimoniale(FAKE_INPUT);
    expect(r).toEqual({ status: 'shared' });
  });

  test('17 — failed/share_failed si shareAsync throw', async () => {
    mockIsAvailable.mockResolvedValueOnce(true);
    mockBuilder.mockReturnValueOnce('<html>ok</html>');
    mockPrintToFile.mockResolvedValueOnce({ uri: 'file:///tmp/x.pdf' });
    mockShareAsync.mockRejectedValueOnce(new Error('cancel or fail'));
    const r = await generateAndShareSynthesePatrimoniale(FAKE_INPUT);
    expect(r).toEqual({ status: 'failed', reason: 'share_failed' });
  });

  test("18 — ne modifie pas l'input", async () => {
    const input: SynthesePatrimonialeInput = {
      positions: [],
      prices: { gold: 2000, currencySymbol: '€' },
      generatedAtIso: '2026-05-09T12:00:00.000Z',
      maskSensitiveValues: false,
    };
    const snap = JSON.parse(JSON.stringify(input));
    mockIsAvailable.mockResolvedValueOnce(true);
    mockBuilder.mockReturnValueOnce('<html>ok</html>');
    mockPrintToFile.mockResolvedValueOnce({ uri: 'file:///tmp/x.pdf' });
    mockShareAsync.mockResolvedValueOnce(undefined);
    await generateAndShareSynthesePatrimoniale(input);
    expect(input).toEqual(snap);
  });
});

describe('generate.ts — invariants statiques', () => {
  const generateSrc = fs.readFileSync(path.resolve(__dirname, '../generate.ts'), 'utf8');

  test("19 — n'importe pas AsyncStorage, Supabase, RevenueCat, FileSystem, analytics", () => {
    expect(generateSrc).not.toMatch(/@react-native-async-storage/);
    expect(generateSrc).not.toMatch(/@supabase/);
    expect(generateSrc).not.toMatch(/react-native-purchases|revenuecat/i);
    expect(generateSrc).not.toMatch(/expo-file-system/);
    expect(generateSrc).not.toMatch(/analytics/i);
  });

  test("20 — n'importe aucun composant React", () => {
    expect(generateSrc).not.toMatch(/from ['"]react['"]/);
    expect(generateSrc).not.toMatch(/from ['"]react-native['"]/);
  });

  test("21 — n'importe aucun fichier app/* ou components/*", () => {
    expect(generateSrc).not.toMatch(/from ['"].*(app|components)\//);
  });

  test("22 — n'appelle pas Date.now()", () => {
    expect(generateSrc).not.toMatch(/Date\.now\(\)/);
  });

  test('23 — pas de console. dans le code exécutable', () => {
    expect(generateSrc).not.toMatch(/console\./);
  });
});
