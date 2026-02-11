# HTTPS dev certificates (mkcert)

Generate locally-trusted certs so the dev server runs over **https://localhost:3000**.

## One-time setup

1. **Install mkcert** (if needed):
   - macOS: `brew install mkcert` then `mkcert -install`
   - Windows: `choco install mkcert` or see https://github.com/FiloSottile/mkcert
   - Linux: `apt install mkcert` or equivalent, then `mkcert -install`

2. **Generate certs** (from project root):
   ```bash
   mkcert -key-file .cert/localhost-key.pem -cert-file .cert/localhost.pem localhost 127.0.0.1
   ```

Or run:
```bash
npm run certs
```

Then start the dev server with `npm run dev` and open **https://localhost:3000**.
