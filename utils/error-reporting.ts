export type ErrorSeverity = 'warning' | 'error';

export type ErrorReportContext = {
  scope: string;
  action: string;
  severity?: ErrorSeverity;
  metadata?: Record<string, unknown>;
};

type NormalizedError = {
  name?: string;
  message: string;
  stack?: string;
};

function normalizeError(error: unknown): NormalizedError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (typeof error === 'string') {
    return { message: error };
  }

  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}

export function reportError(error: unknown, context: ErrorReportContext): void {
  const normalized = normalizeError(error);

  if (__DEV__ && process.env.NODE_ENV !== 'test') {
    console.warn(`[OrTrack:${context.scope}] ${context.action}`, {
      severity: context.severity ?? 'error',
      error: normalized,
      metadata: context.metadata,
    });
  }
}
