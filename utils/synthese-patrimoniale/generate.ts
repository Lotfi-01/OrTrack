import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { buildSynthesePatrimonialeHtml } from './html-builder';

type SynthesePatrimonialeInput = Parameters<typeof buildSynthesePatrimonialeHtml>[0];

export type SyntheseShareResult =
  | { status: 'shared' }
  | { status: 'unavailable'; reason: 'sharing_unavailable' }
  | {
      status: 'failed';
      reason:
        | 'sharing_check_failed'
        | 'html_generation_failed'
        | 'pdf_generation_failed'
        | 'share_failed';
    };

const SHARE_OPTIONS = {
  mimeType: 'application/pdf',
  dialogTitle: 'Partager la synthèse patrimoniale',
} as const;

export async function generateAndShareSynthesePatrimoniale(
  input: SynthesePatrimonialeInput,
): Promise<SyntheseShareResult> {
  let canShare: boolean;
  try {
    canShare = await Sharing.isAvailableAsync();
  } catch {
    return { status: 'failed', reason: 'sharing_check_failed' };
  }

  if (!canShare) {
    return { status: 'unavailable', reason: 'sharing_unavailable' };
  }

  let html: string;
  try {
    const built = buildSynthesePatrimonialeHtml(input);
    if (typeof built !== 'string' || built.length === 0) {
      return { status: 'failed', reason: 'html_generation_failed' };
    }
    html = built;
  } catch {
    return { status: 'failed', reason: 'html_generation_failed' };
  }

  let uri: string;
  try {
    const printed = await Print.printToFileAsync({ html });
    if (!printed || typeof printed.uri !== 'string' || printed.uri.length === 0) {
      return { status: 'failed', reason: 'pdf_generation_failed' };
    }
    uri = printed.uri;
  } catch {
    return { status: 'failed', reason: 'pdf_generation_failed' };
  }

  try {
    await Sharing.shareAsync(uri, SHARE_OPTIONS);
  } catch {
    return { status: 'failed', reason: 'share_failed' };
  }

  return { status: 'shared' };
}
