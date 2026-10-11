import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
/** Dev only: serve /api/*.ts (Vercel Web-signature functions) through Vite so `npm run dev` matches production. */
const vercelApi = (): Plugin => ({
  name: "vercel-api-dev",
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const m = /^\/api\/([a-z-]+)(\?.*)?$/.exec(req.url ?? ""); if (!m) return next();
      try {
        const mod: any = await server.ssrLoadModule(`/api/${m[1]}.ts`); const fn = mod[req.method ?? "GET"]; if (!fn) { res.statusCode = 405; return res.end(); }
        const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
        const r: Response = await fn(new Request(`http://localhost${req.url}`, { method: req.method, headers: req.headers as any, body: ["GET", "HEAD"].includes(req.method!) ? undefined : Buffer.concat(chunks) }));
        res.statusCode = r.status; r.headers.forEach((v, k) => res.setHeader(k, v)); res.end(Buffer.from(await r.arrayBuffer()));
      } catch (e) { res.statusCode = 500; res.end(String(e)); }
    });
  },
});
export default defineConfig({ plugins: [react(), vercelApi()], define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "dev") }, clearScreen: false, server: { port: 1420, strictPort: true }, build: { target: "es2021" } });
