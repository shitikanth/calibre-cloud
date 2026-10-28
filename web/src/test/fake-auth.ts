type RefreshOutcome = 'ok' | 'reconnect' | 'network' | 'offline';

export type HeldRefresh = { readonly started: Promise<void>; release(): void };

export type FakeAuthOptions = { now?: () => number; tokenLifetime?: number };

export class FakeAuthServer {
  readonly requests: string[] = [];
  refreshOutcome: RefreshOutcome = 'ok';
  signOutFails = false;
  private issued = 0;
  private hold: { started: () => void; released: Promise<void> } | undefined;
  private readonly now: () => number;
  private readonly tokenLifetime: number;

  constructor({ now = Date.now, tokenLifetime = 60 * 60 * 1000 }: FakeAuthOptions = {}) {
    this.now = now;
    this.tokenLifetime = tokenLifetime;
  }

  get refreshCount(): number {
    return this.requests.filter((request) => request === 'POST /api/auth/refresh').length;
  }

  holdNextRefresh(): HeldRefresh {
    let started!: () => void;
    let release!: () => void;
    const startedPromise = new Promise<void>((resolve) => (started = resolve));
    const released = new Promise<void>((resolve) => (release = resolve));
    this.hold = { started, released };
    return { started: startedPromise, release };
  }

  readonly fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const path = String(input);
    this.requests.push(`${init.method ?? 'GET'} ${path}`);
    if (path === '/api/auth/refresh' && init.method === 'POST') return this.refresh();
    if (path === '/api/auth/signout' && init.method === 'POST') {
      if (this.signOutFails) throw new TypeError('Failed to fetch');
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 404 });
  };

  private async refresh(): Promise<Response> {
    const hold = this.hold;
    this.hold = undefined;
    if (hold) {
      hold.started();
      await hold.released;
    }
    switch (this.refreshOutcome) {
      case 'offline':
        throw new TypeError('Failed to fetch');
      case 'reconnect':
        return Response.json({ error: 'reconnect' }, { status: 401 });
      case 'network':
        return Response.json({ error: 'network' }, { status: 502 });
      case 'ok':
        this.issued += 1;
        return Response.json({ accessToken: `token-${this.issued}`, expiresAt: this.now() + this.tokenLifetime });
    }
  }
}
