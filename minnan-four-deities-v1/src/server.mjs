import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";


const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".png", "image/png"]
]);


function securityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
  );
}


export function createStaticServer({
  publicDir,
  logger = console
}) {
  const root = path.resolve(publicDir);
  const server = createServer(async (request, response) => {
    const startedAt = Date.now();
    securityHeaders(response);

    try {
      if (!["GET", "HEAD"].includes(request.method)) {
        response.writeHead(405, {
          "Content-Type": "text/plain; charset=utf-8",
          Allow: "GET, HEAD"
        });
        response.end("Method Not Allowed");
        return;
      }

      const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
      let pathname;
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Bad Request");
        return;
      }

      const requested = pathname === "/" ? "/index.html" : pathname;
      const filePath = path.resolve(root, `.${requested}`);
      if (!filePath.startsWith(`${root}${path.sep}`)) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not Found");
        return;
      }

      let fileStat;
      try {
        fileStat = await stat(filePath);
      } catch {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not Found");
        return;
      }
      if (!fileStat.isFile()) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not Found");
        return;
      }

      response.writeHead(200, {
        "Content-Type":
          MIME_TYPES.get(path.extname(filePath).toLowerCase()) ||
          "application/octet-stream",
        "Content-Length": fileStat.size,
        "Cache-Control": "no-cache"
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      createReadStream(filePath).pipe(response);
    } finally {
      logger.info?.(
        JSON.stringify({
          method: request.method,
          path: request.url,
          status: response.statusCode,
          durationMs: Date.now() - startedAt
        })
      );
    }
  });

  return {
    async listen(port = 0, hostname = "127.0.0.1") {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, hostname, () => {
          server.off("error", reject);
          resolve();
        });
      });
      const address = server.address();
      const displayHost =
        typeof address === "object" && address.address === "0.0.0.0"
          ? "127.0.0.1"
          : hostname;
      this.url = `http://${displayHost}:${address.port}`;
      return this.url;
    },
    async close() {
      if (!server.listening) {
        return;
      }
      server.closeAllConnections?.();
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
    url: null
  };
}


const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const host = process.env.HOST || "127.0.0.1";
  const port = Number(process.env.PORT || 8765);
  const app = createStaticServer({
    publicDir: path.join(projectRoot, "public")
  });

  try {
    const url = await app.listen(port, host);
    console.info(`闽南四位神明数字请示体验已启动：${url}`);
  } catch (error) {
    console.error(`启动失败：${error.message}`);
    process.exitCode = 1;
  }

  let stopping = false;
  async function shutdown(signal) {
    if (stopping) {
      return;
    }
    stopping = true;
    console.info(`收到 ${signal}，正在停止服务。`);
    await app.close();
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
