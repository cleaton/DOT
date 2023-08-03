import type { DotMethods } from "./common";
import { dotBase, dotPrefix } from "./common";

type ExcludeMethods<T> = Omit<T, "init" | "fetch" | "dotfetch">;

type ConvertClassToRecord<C> = C extends {
  [k: string]: any;
}
  ? {
      [k in keyof C]: C[k];
    }
  : never;

type IsValid<T> = T extends DotMethods ? T : never;

const urlSplitter = dotBase + dotPrefix;

export type ClientExportType<C> = IsValid<
  ExcludeMethods<ConvertClassToRecord<C>>
>;

export class Dot<Env = unknown> implements DurableObject {
  constructor(protected state: DurableObjectState, protected env: Env) {
    this.init();
  }

  init() {}
  async dotfetch(
    request: Request<unknown, CfProperties<unknown>>
  ): Promise<Response> {
    return new Response("not found", { status: 404 });
  }

  async fetch(
    request: Request<unknown, CfProperties<unknown>>
  ): Promise<Response> {
    const r = request.url.split(urlSplitter);
    // @ts-ignore # typescript does not like string access for class.
    const m = r.length == 2 ? this[r[1]] : undefined;
    if (m) {
      const arg = request.body != null ? await request.json() : undefined;
      const r = await m(arg);
      return new Response(JSON.stringify(r), {
        status: 200,
      });
    }
    return this.dotfetch(request);
  }
}
