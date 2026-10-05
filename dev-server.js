// Local preview: serves public/ and runs the api/ handlers the same way Vercel does.
// Usage: OPENAI_API_KEY=sk-... node dev-server.js  (then open http://localhost:3000)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.PORT) || 3000;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); };

  if (url.pathname.startsWith("/api/")) {
    const name = url.pathname.slice(5).replace(/[^a-z-]/g, "");
    try {
      const mod = await import(`./api/${name}.js`);
      let raw = "";
      for await (const chunk of req) raw += chunk;
      req.body = raw ? JSON.parse(raw) : {};
      return await mod.default(req, res);
    } catch (e) {
      return res.status(404).json({ error: "not_found", message: String(e.message || e) });
    }
  }
  const file = normalize(join("public", url.pathname === "/" ? "index.html" : url.pathname));
  if (!file.startsWith("public")) return res.status(403).end();
  try {
    const body = await readFile(file);
    res.setHeader("Content-Type", TYPES[extname(file)] || "application/octet-stream");
    res.end(body);
  } catch {
    res.status(404).end("Not found");
  }
}).listen(PORT, () => console.log(`Story Week on http://localhost:${PORT}`));
