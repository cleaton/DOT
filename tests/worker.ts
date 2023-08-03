import { Dot } from "../src/dot/object";
import type { ClientExportType } from "../src/dot/object";
import { loadDot } from "../src/dot/client";

type Env = {
    TEST: DurableObjectNamespace
}

export class DotExample extends Dot {
  helloWorld() {
    return "Hello World from Dot!";
  }
  hello(name: string) {
    return "Hello " + name
  }
}

type DotExampleClient = ClientExportType<DotExample>;

export default {
  async fetch(request: Request, env: Env) {
    const df = loadDot<DotExampleClient>(env.TEST)
    const object = df.fromName("testobjid")
    return new Response(await object.call("helloWorld")());
  },
};
