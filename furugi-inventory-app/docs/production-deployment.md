# 本番デプロイ設計: Vercel + Cloudflare Workers

## 構成

- フロントエンド: Vercel / Next.js
- API: Cloudflare Workers / Hono
- DB: Cloudflare D1
- 商品画像: Cloudflare R2

Vercel の画面は `NEXT_PUBLIC_API_BASE_URL` を使って Workers API を呼び出します。未設定の場合はローカル開発用として同一オリジンの `/api` を呼び出します。

## Vercel 環境変数

```txt
NEXT_PUBLIC_API_BASE_URL=https://your-worker.your-subdomain.workers.dev
```

独自ドメインを使う場合は、例として `https://api.example.com` を設定します。

## Cloudflare Workers 環境変数

`wrangler.jsonc` の `vars` に以下を設定します。

```jsonc
{
  "vars": {
    "FRONTEND_ORIGIN": "https://your-vercel-project.vercel.app",
    "SESSION_SAME_SITE": "None"
  }
}
```

本番シークレットは `wrangler secret` で設定します。

```bash
npx wrangler secret put AUTH_PEPPER
```

同一サイトの独自ドメイン構成にする場合は、Cookie Domain も設定できます。

```jsonc
{
  "vars": {
    "FRONTEND_ORIGIN": "https://app.example.com",
    "SESSION_COOKIE_DOMAIN": ".example.com",
    "SESSION_SAME_SITE": "Lax"
  }
}
```

`vercel.app` と `workers.dev` のように別サイト間でCookieを使う場合は `SESSION_SAME_SITE=None` と `Secure` が必要です。ブラウザのサードパーティCookie制限の影響を避けるには、`app.example.com` と `api.example.com` のような同一サイトの独自ドメイン構成を推奨します。

## D1 / R2

`wrangler.jsonc` の `d1_databases` と `r2_buckets` を本番リソースの値に更新します。

```bash
npx wrangler d1 create threadpick-inventory
npx wrangler r2 bucket create threadpick-product-images
npx wrangler d1 migrations apply threadpick-inventory --remote
```

## デプロイ

Cloudflare Workers:

```bash
npm run test:workers
npx wrangler deploy
```

Vercel:

```bash
npm run build
```

Vercel側のProject Settingsで `NEXT_PUBLIC_API_BASE_URL` を設定してからデプロイします。
