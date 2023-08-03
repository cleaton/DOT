type Topics = {
  [topic: string]: any;
};

class DobApi<> {
  constructor(private dobNs: DurableObjectNamespace) {}
  /**
   * name
   */
  public accept(
    request: Request<unknown, CfProperties<unknown>>,
    tags: Array<string>
  ) {
    request.headers.append("X-dob-tags", JSON.stringify(tags));
    const dob = this.dobNs.idFromName();
  }

  private broadcast<T extends keyof Ts>(topic: T, value: Ts[T], tag?: string) {
    this.dobNs.idFromName();
  }
}

export class DobGroup implements DurableObject {

}

export abstract class DobB<Env = unknown> implements DurableObject {
  private isLeader;
  protected maxGroups = 5000;
  protected maxConnectionsPerGroup = 10000;
  protected groups: Array<[string, number | undefined]> = []
  constructor(private state: DurableObjectState, private env: Env) {
    this.isLeader = state.id.name != undefined
    if (this.isLeader) {
      // Recover existing groups
      this.state.blockConcurrencyWhile(async () => {
        const groups = await state.storage.list({limit: this.maxGroups})
        this.groups = [...groups.keys()].map(k => [k, undefined])
        this.sort()
      })
    }
  }

  private sort() {
    this.groups.sort((a, b) => (a[0] > b[0] ? 1 : -1))
  }

  private getNext() {
    let existing = this.groups.find(g => g[1] == undefined || g[1] < this.maxConnectionsPerGroup)
    if (existing == undefined && this.groups.length < this.maxGroups) {
      existing = this.addGroup()
    }
    return existing
  }

  private addGroup() {
    const id = this.doNamespace(this.env).dob.newUniqueId().toString()
    const group: [string, number] = [id, 0]
    this.state.storage.put(id, null)
    this.groups.push(group)
    this.sort()
    return group
  }

  

  protected abstract doNamespace(env: Env): {dob: DurableObjectNamespace, control: DurableObjectNamespace};
  async fetch(
    request: Request<unknown, CfProperties<unknown>>
  ): Promise<Response> {
    if (this.isLeader) {
      const group = this.getNext()
      if (group) {
        const id = this.doNamespace(this.env).dob.idFromString(group[0])
        const dgroup = this.doNamespace(this.env).dob.get(id)
        const response = await dgroup.fetch(request)
        group[1] = Number(response.headers.get('x-socket-count'))
        return response
      } else {
        return new Response("too many connections, retry later", {status: 429})
      }
    } else {
      const webSocketPair = new WebSocketPair();
      this.state.acceptWebSocket(webSocketPair[1]);
      return new Response(null, {
        status: 101,
        webSocket: webSocketPair[0],
        headers: {
          'x-socket-count': (this.state.getWebSockets().length + 1).toString()
        }
      });
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

export class DobConnectionGroup<Env = unknown> implements DurableObject {
  private isLeader;
  protected maxGroups = 5000;
  protected maxConnectionsPerGroup = 10000;
  constructor(protected state: DurableObjectState, protected env: Env) {
    this.isLeader = state.id.name != undefined
    if (this.isLeader) {
      this.state.blockConcurrencyWhile(async () => {
        const groups = await state.storage.list<string>({limit: this.maxGroups})
      })
    }
  }
  private newGroup() {
    this.state.waitUntil()
  }
  async fetch(
    request: Request<unknown, CfProperties<unknown>>
  ): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader !== "websocket") {
      return new Response("Expected Upgrade: websocket", { status: 426 });
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
