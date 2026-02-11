/**
 * HTTPS dev server using mkcert certificates.
 * Run once: npm run certs  (or see .cert/README)
 * Then: npm run dev  → https://localhost:3000
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const { parse } = require('url');

const certDir = path.join(__dirname, '.cert');
const keyPath = path.join(certDir, 'localhost-key.pem');
const certPath = path.join(certDir, 'localhost.pem');

if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  console.error('\nMissing HTTPS certificates. Run first:\n');
  console.error('  npm run certs\n');
  console.error('Or manually:');
  console.error('  mkdir -p .cert');
  console.error('  mkcert -key-file .cert/localhost-key.pem -cert-file .cert/localhost.pem localhost 127.0.0.1\n');
  process.exit(1);
}

const options = {
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath),
};

const next = require('next');
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = https.createServer(options, (req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const port = parseInt(process.env.PORT || '3000', 10);
  server.listen(port, (err) => {
    if (err) throw err;
    console.log('');
    console.log('  ▲ Next.js (HTTPS dev)');
    console.log(`  - Local: https://localhost:${port}`);
    console.log('  - Certs: mkcert (.cert/)');
    console.log('');
  });
});
