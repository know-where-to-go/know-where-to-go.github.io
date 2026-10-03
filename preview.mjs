import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
};
const publicFiles = new Set(["index.html", "styles.css", "script.js"]);

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    response.writeHead(400).end("Invalid URL");
    return;
  }
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const path = resolve(root, relative);
  if (
    !path.startsWith(root + sep) ||
    !(publicFiles.has(relative) || relative.startsWith("assets/")) ||
    !types[extname(path)]
  ) {
    response.writeHead(404).end("Not found");
    return;
  }
  try {
    const content = await readFile(path);
    const headers = {
      "Content-Type": types[extname(path)],
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Accept-Ranges": "bytes",
      "Content-Length": content.length,
    };
    if (request.method === "GET" && request.headers.range) {
      const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
      const first = range?.[1] ? Number(range[1]) : null;
      const last = range?.[2] ? Number(range[2]) : null;
      if (
        !range || (first === null && last === null) ||
        (first !== null && !Number.isSafeInteger(first)) ||
        (last !== null && !Number.isSafeInteger(last)) ||
        (first === null && last === 0)
      ) {
        response.writeHead(416, { "Content-Range": `bytes */${content.length}` }).end("Invalid byte range");
        return;
      }
      const start = first ?? Math.max(0, content.length - last);
      const end = first === null || last === null ? content.length - 1 : Math.min(last, content.length - 1);
      if (start > end || start >= content.length) {
        response.writeHead(416, { "Content-Range": `bytes */${content.length}` }).end("Unsatisfiable byte range");
        return;
      }
      response.writeHead(206, {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${content.length}`,
        "Content-Length": end - start + 1,
      });
      response.end(content.subarray(start, end + 1));
      return;
    }
    response.writeHead(200, headers);
    response.end(request.method === "HEAD" ? undefined : content);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR" || error.code === "ENOTDIR") {
      response.writeHead(404).end("Not found");
      return;
    }
    console.error("Preview request failed:", error);
    response.writeHead(500).end("Preview request failed");
  }
});
server.on("error", (error) => {
  console.error("Could not start preview:", error);
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => {
  console.log(`Paper website preview: http://127.0.0.1:${server.address().port}`);
});
