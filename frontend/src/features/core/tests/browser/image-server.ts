import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export type ImageRoute = (response: ServerResponse) => void;

/**
 * A local server for the photos that an agent points the Worker at. The Worker
 * cannot reach a test in any other way, and only a Worker started for the
 * black-box tests accepts a local download link. It runs in the Node process of
 * the test, so it is the one place of an API test that loads Node modules.
 */
export class ImageServer {
  private constructor(
    private readonly server: Server,
    readonly origin: string,
  ) {}

  static async start(routes: Record<string, ImageRoute>): Promise<ImageServer> {
    const server = createServer((request, response) => {
      const route = routes[request.url ?? ""];
      if (route) {
        route(response);
      } else {
        response.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address() as AddressInfo;
    return new ImageServer(server, `http://127.0.0.1:${port}`);
  }

  async stop(): Promise<void> {
    await new Promise((resolve) => this.server.close(resolve));
  }
}
