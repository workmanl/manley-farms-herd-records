// Development-only static server with the production manifest path. No packages.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = new URL("../app/", import.meta.url),
  manifest = JSON.parse(await readFile(new URL("manifest.webmanifest", root)));
const types = {
  html: "text/html",
  js: "text/javascript",
  css: "text/css",
  svg: "image/svg+xml",
  png: "image/png",
  webmanifest: "application/manifest+json",
  txt: "text/plain",
};
http
  .createServer(async (req, res) => {
    try {
      const path = new URL(req.url, "http://localhost").pathname;
      if (!path.startsWith(manifest.scope)) {
        res.writeHead(302, { Location: manifest.scope });
        res.end();
        return;
      }
      const relative =
        decodeURIComponent(path.slice(manifest.scope.length)) || "index.html";
      const file = new URL(relative, root);
      if (!fileURLToPath(file).startsWith(fileURLToPath(root)))
        throw Error("outside root");
      const body = await readFile(file);
      res.writeHead(200, {
        "Content-Type": types[relative.split(".").at(-1)] || "text/plain",
        "Cache-Control": "no-cache",
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(8765, "127.0.0.1", () =>
    console.log(`Open http://127.0.0.1:8765${manifest.scope}`),
  );
