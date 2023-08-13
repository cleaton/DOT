type Topics = {
  [topic: string]: any;
};

type WebSocketGroup = {
  id: string;
  pending: boolean;
  count: number | undefined;
};

const CLEAN_AT_MOST_EVERY = 15 * 60 * 1000; // 15 minutes
const BASE_URL = "http://dob";
const JOIN_ROUTE = "/~d/j";
const BROADCAST_ROUTE = "/~d/b";

function defaultGroupLookup(req: Request<unknown, CfProperties<any>>): string {
  return (req.cf?.colo as string) ?? "unknown";
}

class DobWorkerApi {
  constructor(
    private dobNs: DurableObjectNamespace,
    private groupLookup: (
      req: Request<unknown, CfProperties<unknown>>
    ) => string = defaultGroupLookup
  ) {}
  public join(
    namespace: string,
    request: Request<unknown, CfProperties<unknown>>,
    tags: Array<string> = []
  ) {
    const g = this.groupLookup(request);
    const r = new Request(BASE_URL + JOIN_ROUTE, request);
    r.headers.append("x-dob-tags", JSON.stringify(tags));
    const dob = this.dobNs.idFromName(namespace + "_" + g);
    this.dobNs.get(dob).fetch(request);
  }

  private broadcast<T extends keyof Ts>(topic: T, value: Ts[T], tag?: string) {
    this.dobNs.idFromName();
  }
}

class DobDoAp<T> {
  public isRegister(req: Request<unknown, CfProperties<unknown>>) {
    
  }
  public handleRegister(req: Request<unknown, CfProperties<unknown>>) {

  }
  public broadcast<M extends T>(msg: M, tag?: string) {

  }
}

export class DobGroup implements DurableObject {}

export abstract class DobB<Env = unknown> implements DurableObject {
  protected readonly maxGroups = 5000;
  protected readonly maxConnectionsPerGroup = 10000;
  protected groups: Array<WebSocketGroup> = [];
  private isLeader;
  private lastClean = Date.now();

  constructor(private state: DurableObjectState, private env: Env) {
    this.isLeader = state.id.name != undefined;
    if (this.isLeader) {
      // Recover existing groups
      this.state.blockConcurrencyWhile(async () => {
        const groups = await state.storage.list({ limit: this.maxGroups });
        this.groups = [...groups.keys()].map((k) => ({
          id: k,
          pending: false,
          count: undefined,
        }));
        this.sort();
      });
    }
  }

  private sort() {
    this.groups.sort((a, b) => (a.id > b.id ? 1 : -1));
  }

  private getGroup() {
    let group = this.groups.find(
      (g) => g.count == undefined || g.count < this.maxConnectionsPerGroup
    );
    if (group == undefined && this.groups.length < this.maxGroups) {
      group = this.addGroup();
    }
    return group;
  }

  private addGroup() {
    const id = this.doNamespace(this.env).dob.newUniqueId().toString();
    const group: WebSocketGroup = { id, pending: false, count: 0 };
    this.state.storage.put(id, null);
    this.groups.push(group);
    this.sort();
    return group;
  }

  private cleanGroups() {
    const now = Date.now();
    if (now - this.lastClean > CLEAN_AT_MOST_EVERY) {
      this.lastClean = now;
      const cleaned = this.groups.filter(
        (g) => g.count == undefined || g.count > 0 || g.pending == true
      );
      if (cleaned.length != this.groups.length) {
        this.groups = cleaned;
      }
    }
  }

  private async doBroadcast(
    request: Request<unknown, CfProperties<unknown>>
  ): Promise<Response> {
    if (this.isLeader) {
      const bc = this.groups.map(async (group) => {
        const id = this.doNamespace(this.env).dob.idFromString(group.id);
        const dgroup = this.doNamespace(this.env).dob.get(id);
        const response = await dgroup.fetch(request);
        group.count = Number(response.headers.get("x-socket-count"));
      });
      this.state.waitUntil(Promise.all(bc).then((_) => this.cleanGroups()));
      return new Response(null, { status: 204 });
    } else {
      const websockets = this.state.getWebSockets();
      const msg = await request.text();

      this.state.waitUntil(
        new Promise<void>((resolve, reject) => {
          websockets.forEach((ws) => ws.send(msg));
          resolve();
        })
      );

      return new Response(null, {
        status: 204,
        headers: {
          "x-socket-count": this.state.getWebSockets().length.toString(),
        },
      });
    }
  }

  private async doJoin(
    request: Request<unknown, CfProperties<unknown>>
  ): Promise<Response> {
    if (this.isLeader) {
      const group = this.getGroup();
      if (group) {
        group.pending = true;
        const id = this.doNamespace(this.env).dob.idFromString(group.id);
        const dgroup = this.doNamespace(this.env).dob.get(id);
        const response = await dgroup.fetch(request);
        group.count = Number(response.headers.get("x-socket-count"));
        group.pending = false;
        return new Response(response.body, {
          status: response.status,
          webSocket: response.webSocket,
        });
      } else {
        return new Response("too many connections, retry later", {
          status: 429,
        });
      }
    } else {
      const webSocketPair = new WebSocketPair();
      this.state.acceptWebSocket(webSocketPair[1]);
      return new Response(null, {
        status: 101,
        webSocket: webSocketPair[0],
        headers: {
          "x-socket-count": (this.state.getWebSockets().length + 1).toString(),
        },
      });
    }
  }

  protected abstract doNamespace(env: Env): {
    dob: DurableObjectNamespace;
    control: DurableObjectNamespace;
  };

  async fetch(
    request: Request<unknown, CfProperties<unknown>>
  ): Promise<Response> {
    let { pathname } = new URL(request.url, BASE_URL);
    if (pathname == "/~dob/j") {
      return this.doJoin(request);
    } else if (pathname == "/~dob/b") {
      return this.doBroadcast(request);
    } else {
      return new Response("no such command", { status: 404 });
    }
  }

  // Ignore incoming messages, we only want to broadcast to active sockets
  webSocketMessage(ws: WebSocket, message: String | ArrayBuffer) {}
  webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean
  ) {}
  webSocketError(ws: WebSocket, error: any) {}
}

type DobMsg = { type: "register"; topic: string; group: string };

export class Dob<Ts extends Topics> {
  constructor(private state: DurableObjectState, private dobSecretId: string) {}

  isDob(request: Request<unknown, CfProperties<unknown>>): boolean {
    return request.headers.get("X-DOB-SECRET-ID") === this.dobSecretId;
  }

  async handleRequest(
    request: Request<unknown, CfProperties<unknown>>
  ): Promise<Response> {
    const msg = await request.json<DobMsg>();
  }

  private broadcast<T extends keyof Ts>(topic: T, value: Ts[T], tag?: string) {}
}
