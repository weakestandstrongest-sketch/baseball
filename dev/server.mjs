// ローカル確認用サーバー: public/ を配信し、/api/* は functions/ のハンドラーを直接呼ぶ。
//   node dev/server.mjs          … 実データ (外部サイトへアクセス)
//   MOCK=1 node dev/server.mjs   … test/fixtures のダミーデータ
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT || 8788);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

if (process.env.MOCK) {
  const { installMockFetch } = await import('../test/mock-fetch.js');
  installMockFetch();
  console.log('MOCK モード: test/fixtures のデータを返します');
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      const file = join(ROOT, 'functions', normalize(url.pathname).replace(/\.\./g, '') + '.js');
      const mod = await import(pathToFileURL(file).href);
      const response = await mod.onRequestGet({ request: new Request(url.toString()) });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    let p = normalize(url.pathname).replace(/\.\./g, '');
    if (p.endsWith('/')) p += 'index.html';
    const body = await readFile(join(ROOT, 'public', p));
    res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    res.writeHead(e.code === 'ENOENT' || e.code === 'ERR_MODULE_NOT_FOUND' ? 404 : 500, { 'Content-Type': 'text/plain' });
    res.end(String(e.message));
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
