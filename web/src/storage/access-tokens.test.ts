import { describe, expect, test } from 'vitest';
import { FakeAuthServer } from '../test/fake-auth.ts';
import { createAccessTokens } from './access-tokens.ts';
import { Network, ReconnectRequired } from './adapter.ts';

const minute = 60 * 1000;

function setup() {
  let time = 1_000_000;
  const clock = {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
  const server = new FakeAuthServer({ now: clock.now, tokenLifetime: 60 * minute });
  const tokens = createAccessTokens({ fetch: server.fetch, now: clock.now });
  return { clock, server, tokens };
}

describe('access tokens', () => {
  test('the first request refreshes, and later requests reuse the token', async () => {
    const { server, tokens } = setup();

    expect(await tokens.get()).toBe('token-1');
    expect(await tokens.get()).toBe('token-1');
    expect(server.requests).toEqual(['POST /api/auth/refresh']);
  });

  test('a token is replaced shortly before it expires', async () => {
    const { clock, server, tokens } = setup();
    await tokens.get();

    clock.advance(55 * minute);
    expect(await tokens.get()).toBe('token-1');
    clock.advance(4 * minute);
    expect(await tokens.get()).toBe('token-2');
    expect(server.refreshCount).toBe(2);
  });

  test('a forced refresh replaces a token that is still fresh', async () => {
    const { server, tokens } = setup();
    await tokens.get();

    expect(await tokens.get({ refresh: true })).toBe('token-2');
    expect(await tokens.get()).toBe('token-2');
    expect(server.refreshCount).toBe(2);
  });

  test('callers who ask while a refresh is in flight share it', async () => {
    const { server, tokens } = setup();
    const held = server.holdNextRefresh();

    const first = tokens.get();
    await held.started;
    const second = tokens.get();
    const forced = tokens.get({ refresh: true });
    held.release();

    expect(await Promise.all([first, second, forced])).toEqual(['token-1', 'token-1', 'token-1']);
    expect(server.refreshCount).toBe(1);
  });

  test('a refused refresh asks the user to reconnect', async () => {
    const { server, tokens } = setup();
    server.refreshOutcome = 'reconnect';

    await expect(tokens.get()).rejects.toBeInstanceOf(ReconnectRequired);
  });

  test.each([
    ['the provider is unreachable', 'network'],
    ['the browser is offline', 'offline'],
  ] as const)('a failed refresh is a network error when %s', async (_case, outcome) => {
    const { server, tokens } = setup();
    server.refreshOutcome = outcome;

    await expect(tokens.get()).rejects.toBeInstanceOf(Network);
  });

  test('a failed refresh is retried by the next caller', async () => {
    const { server, tokens } = setup();
    server.refreshOutcome = 'offline';
    await expect(tokens.get()).rejects.toBeInstanceOf(Network);

    server.refreshOutcome = 'ok';
    expect(await tokens.get()).toBe('token-1');
  });

  test('signing out ends the sign-in and forgets the token', async () => {
    const { server, tokens } = setup();
    await tokens.get();

    await tokens.signOut();

    expect(server.requests).toEqual(['POST /api/auth/refresh', 'POST /api/auth/signout']);
    expect(await tokens.get()).toBe('token-2');
  });

  test('signing out forgets the token even when the server cannot be reached', async () => {
    const { server, tokens } = setup();
    await tokens.get();
    server.signOutFails = true;

    await tokens.signOut();

    expect(await tokens.get()).toBe('token-2');
  });

  test('a refresh that finishes after signing out is not kept', async () => {
    const { server, tokens } = setup();
    const held = server.holdNextRefresh();
    const pending = tokens.get();
    await held.started;

    await tokens.signOut();
    held.release();
    await pending;

    expect(await tokens.get()).toBe('token-2');
  });
});
