import { defineConfig } from 'vitest/config';
import { loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Serves api/*.ts in development the way Vercel does in production, so /api/explain works with npm run dev. */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      Object.assign(process.env, loadEnv(server.config.mode, process.cwd(), ''), process.env);
      server.middlewares.use('/api/explain', async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const mod = await server.ssrLoadModule('/api/explain.ts');
        const out: Response = await mod.default(new Request('http://localhost/api/explain', { method: req.method, headers: { 'content-type': 'application/json' }, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined }));
        res.statusCode = out.status;
        res.setHeader('Content-Type', 'application/json');
        res.end(await out.text());
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devApi()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
