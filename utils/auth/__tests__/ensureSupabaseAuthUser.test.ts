// RP1.2 — tests ensureSupabaseAuthUser.

const mockGetSession = jest.fn();
const mockSignInAnonymously = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      signInAnonymously: (...args: unknown[]) => mockSignInAnonymously(...args),
    },
  },
}));

import {
  ensureSupabaseAuthUser,
  SupabaseAuthError,
} from '../ensureSupabaseAuthUser';

describe('ensureSupabaseAuthUser', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockSignInAnonymously.mockReset();
  });

  test('retourne le user si une session existe', async () => {
    const user = { id: 'user-1', is_anonymous: true };
    mockGetSession.mockResolvedValue({
      data: { session: { user } },
      error: null,
    });
    const result = await ensureSupabaseAuthUser();
    expect(result).toEqual(user);
    expect(mockSignInAnonymously).not.toHaveBeenCalled();
  });

  test('crée un anonymous user si aucune session', async () => {
    const user = { id: 'user-2', is_anonymous: true };
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mockSignInAnonymously.mockResolvedValue({
      data: { user },
      error: null,
    });
    const result = await ensureSupabaseAuthUser();
    expect(result).toEqual(user);
    expect(mockSignInAnonymously).toHaveBeenCalledTimes(1);
  });

  test('lève SupabaseAuthError si getSession échoue', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'network_error' },
    });
    await expect(ensureSupabaseAuthUser()).rejects.toBeInstanceOf(
      SupabaseAuthError,
    );
  });

  test('lève SupabaseAuthError si signInAnonymously échoue', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mockSignInAnonymously.mockResolvedValue({
      data: { user: null },
      error: { message: 'anonymous_sign_ins_disabled' },
    });
    await expect(ensureSupabaseAuthUser()).rejects.toMatchObject({
      name: 'SupabaseAuthError',
      message: 'anonymous_sign_in_failed',
    });
  });

  test('lève SupabaseAuthError si data.user est absent', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mockSignInAnonymously.mockResolvedValue({
      data: { user: null },
      error: null,
    });
    await expect(ensureSupabaseAuthUser()).rejects.toMatchObject({
      message: 'anonymous_sign_in_no_user',
    });
  });

  test('SupabaseAuthError est instance d Error', () => {
    const e = new SupabaseAuthError('test', new Error('cause'));
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('SupabaseAuthError');
  });
});
