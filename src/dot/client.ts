import type { DotMethods } from "./common";
import { dotBase, dotPrefix } from "./common";

type DotArg<F> = F extends (arg: infer I) => any ? I : never;
type DotReturn<F> = F extends (arg: any) => infer R
  ? R extends Promise<infer T>
    ? T
    : R
  : never;

class DotClient<Dot extends DotMethods> {
  constructor(private stub: DurableObjectStub) {}

  public get id(): DurableObjectId {
    return this.stub.id;
  }

  public get name(): string | unknown {
    return this.stub.name;
  }

  public call<M extends keyof Dot & string>(m: M) {
    const url = new URL(dotPrefix + m, dotBase);
    const f = async (arg: any) => {
      const init =
        arg == undefined
          ? { method: "GET" }
          : {
              method: "POST",
              body: JSON.stringify(arg),
            };
      const r = await this.stub.fetch(url, init);
      return r.body != null ? r.json<DotReturn<Dot[M]>>() : undefined;
    };
    return f as Dot[M];
  }
}

class DotFactory<T extends DotMethods> {
  constructor(private ns: DurableObjectNamespace) {}
  /**
   * name
   */
  public fromName(
    name: string,
    options?: DurableObjectNamespaceGetDurableObjectOptions | undefined
  ): DotClient<T> {
    return this.fromId(this.ns.idFromName(name), options);
  }
  /**
   * name
   */
  public fromString(
    id: string,
    options?: DurableObjectNamespaceGetDurableObjectOptions | undefined
  ): DotClient<T> {
    return this.fromId(this.ns.idFromString(id), options);
  }
  /**
   * name
   */
  public fromId(
    id: DurableObjectId,
    options?: DurableObjectNamespaceGetDurableObjectOptions | undefined
  ): DotClient<T> {
    return new DotClient(this.ns.get(id, options));
  }
}

export function loadDot<T extends DotMethods>(ns: DurableObjectNamespace) {
  return new DotFactory<T>(ns);
}
