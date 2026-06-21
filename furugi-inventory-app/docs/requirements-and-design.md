# 古着在庫・販売管理アプリ MVP 要件定義・技術設計

## 1. 目的

Google フォーム + スプレッドシート運用を補完・置き換えるため、古着商品の登録、画像確認、採寸、店頭販売、売却済み管理を行う。

主目的は、画像と管理番号を見やすく表示し、複数人で作業状態を管理できるようにすること。

## 2. 利用条件

| 項目 | 内容 |
| --- | --- |
| 利用者 | 複数人 |
| 在庫数 | 100 件前後 |
| 利用端末 | PC 中心 |
| 認証 | メール + パスワード |
| 画像 | アプリへアップロード |
| 画像公開範囲 | 画像 URL を知っていれば見えても問題ない |
| 販売 | 店頭販売 |
| 既存データ移行 | しない |
| Google フォーム | しばらく併用 |
| 権限 | admin / member |

## 3. 業務フロー

```text
商品登録 -> 未採寸 -> 採寸済み -> 販売中 -> 売却済み
```

返品は少ないが、将来対応できるよう `returned` を用意する。

## 4. 権限要件

| 操作 | admin | member |
| --- | ---: | ---: |
| 商品登録 | 可 | 可 |
| 商品編集 | 可 | 可 |
| 採寸登録・編集 | 可 | 可 |
| 販売状態変更 | 可 | 可 |
| 売却情報編集 | 可 | 可 |
| 商品削除 | 可 | 不可 |
| ユーザー追加 | 可 | 不可 |
| 権限変更 | 可 | 不可 |

削除は物理削除ではなく、`deleted_at` を使う論理削除にする。

## 5. 商品入力要件

| 項目 | 型 | 仕様 |
| --- | --- | --- |
| 管理番号 | String | 手入力・コピペ |
| 画像 | File | 基本 1 枚、R2 へ保存 |
| colour | Int | 手入力または数値入力 |
| 大カテゴリ | String | 確定リスト |
| 小カテゴリ | String | 大カテゴリとは独立 |
| サイズ | String | 選択式 |
| 販売価格 | Int | 任意 |
| 備考 | Text | 任意 |

### 大カテゴリ

```text
トップス
アウター
ボトムス
ワンピース・セットアップ
スポーツ・アウトドア
バッグ
帽子・小物
アクセサリー
```

### サイズ

```text
XS / S / M / L / XL / 2XL / 3XL / FREE / 不明
```

## 6. 採寸要件

- 採寸単位は cm。
- 採寸者は自動記録。
- 採寸後の修正は可能。
- 入力漏れは保存不可ではなく、警告のみ。

## 7. 販売要件

- 店頭販売を想定。
- 販売価格の入力タイミングは任意。
- 売却済みにする際、価格入力は必須ではない。
- 売却後も修正可能。
- 返品は低頻度だが状態として保持する。

## 8. 技術構成

```text
Frontend: Next.js
Backend/API: Hono
Runtime: Cloudflare Workers
Database: Cloudflare D1
Storage: Cloudflare R2
Auth: メール + パスワード認証
```

画像本体は D1 に保存せず、R2 に保存し、D1 には `image_key` のみ保存する。

画像 URL を知っていれば見えても問題ない運用のため、MVP では次のどちらかを採用する。

- R2 public bucket またはカスタムドメインで配信する。
- 期限付き署名 URL を発行し、URL 共有時の露出期間を制限する。

在庫画像が外部流出して困る運用に変わった場合は、認証付き API 経由で画像を返す方式に切り替える。

## 9. 画面設計

| 画面 | 目的 |
| --- | --- |
| ログイン | メール + パスワード認証 |
| 商品一覧 | 画像・管理番号・状態を一覧表示 |
| 商品登録 | 商品情報と画像を登録 |
| 商品詳細 | 商品・採寸・販売情報を確認 |
| 採寸入力 | 採寸値を登録・修正 |
| 未採寸一覧 | 未採寸商品の作業リスト |
| 採寸済み一覧 | 販売前の商品確認 |
| 販売中一覧 | 店頭販売中の商品確認 |
| 売却済み一覧 | 売却済み商品の履歴確認 |
| 削除済み一覧 | admin のみ |
| ユーザー管理 | admin のみ |

## 10. DB スキーマ案

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  management_number TEXT NOT NULL,
  image_key TEXT,
  colour INTEGER,
  main_category TEXT NOT NULL,
  sub_category TEXT,
  size TEXT NOT NULL CHECK (
    size IN ('XS','S','M','L','XL','2XL','3XL','FREE','不明')
  ),
  status TEXT NOT NULL DEFAULT 'unmeasured' CHECK (
    status IN ('unmeasured','measured','selling','sold','returned')
  ),
  price INTEGER,
  note TEXT,
  created_by INTEGER NOT NULL,
  updated_by INTEGER,
  deleted_at TEXT,
  deleted_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (updated_by) REFERENCES users(id),
  FOREIGN KEY (deleted_by) REFERENCES users(id)
);

CREATE TABLE measurements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL UNIQUE,
  length_cm REAL,
  body_width_cm REAL,
  shoulder_width_cm REAL,
  sleeve_length_cm REAL,
  waist_cm REAL,
  rise_cm REAL,
  inseam_cm REAL,
  thigh_width_cm REAL,
  hem_width_cm REAL,
  measured_by INTEGER NOT NULL,
  measured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (measured_by) REFERENCES users(id)
);

CREATE TABLE sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL UNIQUE,
  sold_price INTEGER,
  sold_at TEXT,
  sold_by INTEGER,
  is_returned INTEGER NOT NULL DEFAULT 0,
  returned_at TEXT,
  memo TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (sold_by) REFERENCES users(id)
);

CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_management_number ON products(management_number);
CREATE INDEX idx_products_deleted_at ON products(deleted_at);
```

## 11. API 設計

### 認証

| Method | Path | 内容 |
| --- | --- | --- |
| POST | `/auth/login` | ログイン |
| POST | `/auth/logout` | ログアウト |
| GET | `/auth/me` | ログイン中ユーザー取得 |

### 商品

| Method | Path | 内容 |
| --- | --- | --- |
| GET | `/products` | 商品一覧 |
| GET | `/products/:id` | 商品詳細 |
| POST | `/products` | 商品登録 |
| PATCH | `/products/:id` | 商品編集 |
| PATCH | `/products/:id/status` | 状態変更 |
| DELETE | `/products/:id` | 論理削除、admin のみ |

### 画像

| Method | Path | 内容 |
| --- | --- | --- |
| POST | `/products/:id/image` | R2 へ画像アップロード |
| GET | `/images/:key` | 画像取得またはリダイレクト |

### 採寸

| Method | Path | 内容 |
| --- | --- | --- |
| GET | `/products/:id/measurement` | 採寸取得 |
| PUT | `/products/:id/measurement` | 採寸登録・更新 |

### 販売

| Method | Path | 内容 |
| --- | --- | --- |
| PUT | `/products/:id/sale` | 売却情報登録・更新 |
| PATCH | `/products/:id/return` | 返品状態に変更 |

### ユーザー管理

| Method | Path | 内容 |
| --- | --- | --- |
| GET | `/users` | ユーザー一覧、admin のみ |
| POST | `/users` | ユーザー追加、admin のみ |
| PATCH | `/users/:id` | 権限変更、admin のみ |

## 12. 実装順

### Step 1: 基盤構築

```text
Next.js 作成
Hono API 作成
Cloudflare Workers 設定
D1 作成
R2 作成
環境変数設定
```

### Step 2: 認証

```text
users テーブル作成
初期 admin 作成
ログイン API
ログアウト API
セッション管理
admin/member 判定
```

### Step 3: 商品管理

```text
商品登録 API
商品一覧 API
商品詳細 API
商品登録画面
商品一覧画面
商品詳細画面
```

### Step 4: 画像管理

```text
R2 アップロード API
image_key 保存
一覧画像表示
詳細画像表示
```

### Step 5: 採寸管理

```text
採寸登録・更新 API
採寸入力画面
未採寸一覧
採寸保存後 status = measured
```

### Step 6: 販売管理

```text
販売中変更
売却済み変更
売却情報登録
売却済み一覧
返品ステータス
```

### Step 7: 管理機能

```text
ユーザー管理
権限変更
論理削除
削除済み一覧
```

## 13. セキュリティ注意事項

### パスワードハッシュ化

- 平文パスワードは DB、ログ、例外メッセージ、分析ツールに保存しない。
- `password_hash` には Argon2id を第一候補として使う。Cloudflare Workers 環境でライブラリ互換性に問題がある場合は bcrypt または scrypt を検討する。
- ハッシュにはユーザーごとの salt を必ず使う。salt は通常ライブラリがハッシュ文字列内に保持する。
- 可能であればアプリ全体の pepper を環境変数または Secrets に置き、DB とは別に管理する。
- ログイン失敗時は「メールまたはパスワードが違います」のような汎用エラーにして、メール存在確認に使われないようにする。
- ログイン試行回数制限、遅延、アカウントロックまたは一時ブロックを入れる。
- 初期 admin のパスワードはデプロイ後に必ず変更し、シード値や `.env` を Git に含めない。

### セッション管理

- セッション ID は十分に長い暗号学的乱数で生成する。
- セッション ID そのものを DB に保存する場合は、漏えい時の悪用を減らすためハッシュ化して保存する。
- Cookie には `HttpOnly`, `Secure`, `SameSite=Lax` 以上を設定する。管理系操作が増える場合は CSRF 対策も明示的に入れる。
- セッション Cookie にユーザー情報や権限をそのまま信用できる形で入れない。権限判定は API またはデータアクセス層で毎回確認する。
- ログアウト時は Cookie 削除だけでなく、DB 側のセッションも失効させる。
- パスワード変更、権限変更、ユーザー無効化時は既存セッションを失効させる。
- セッション有効期限は短めの idle timeout と長めの absolute timeout を分けて設計する。
- Cloudflare Workers でステートレスセッションを使う場合は署名または暗号化し、鍵ローテーション方針を決める。

### Next.js における脆弱性・実装上の注意

- Next.js と React はセキュリティ修正が頻繁に出るため、`next`, `react`, `react-dom` は定期的に更新し、GitHub Security Advisories と `npm audit`/Dependabot で監視する。
- Middleware/Proxy は UX 用の事前チェックとして扱い、唯一の認可境界にしない。商品削除、ユーザー追加、権限変更などは必ず API/Hono 側またはデータアクセス層で認可する。
- Server Components、Route Handlers、Server Actions からクライアントへ返すデータは DTO 化し、`password_hash`、セッション ID、内部メモなどを含めない。
- `NEXT_PUBLIC_` が付いた環境変数はブラウザに公開される。R2 秘密鍵、DB 接続情報、セッション秘密鍵、pepper は絶対に `NEXT_PUBLIC_` にしない。
- `next/image` で外部画像ドメインを許可する場合は、許可ドメインを最小限にする。任意 URL を画像最適化 API に渡せる設計は避ける。
- CSP、`X-Frame-Options` または `frame-ancestors`、`Referrer-Policy`、`X-Content-Type-Options` などのセキュリティヘッダーを `next.config` または Cloudflare 側で設定する。
- `dangerouslySetInnerHTML`、外部スクリプト、ユーザー入力を含む `beforeInteractive` スクリプトを避ける。必要な場合はサニタイズと CSP を必須にする。
- キャッシュ設定に注意する。ログインユーザー別のデータ、在庫詳細、ユーザー管理画面を CDN や共有キャッシュに保存しない。
- App Router のプリフェッチ、キャッシュ、Server Component のレスポンスにより、意図しないデータ露出が起きないように認可後のデータだけを返す。
- エラー画面やログにパスワード、Cookie、画像署名 URL、R2 key、個人情報を出さない。
- 本番ビルドで source map を公開する場合は、公開して問題ないか確認する。不要なら production browser source maps は無効のままにする。

## 14. 懸念点

一番の懸念は、R2 画像表示と認証セッション。

画像は「URL を知っていれば見えても問題ない」運用とするため、MVP では画像取得の認可実装は軽くできる。ただし、画像 URL の再共有や検索エンジンへの露出が問題になる場合は、公開配信をやめて認証付き API または短期限の署名 URL へ切り替える。

もう一点、パスワード認証は Google 認証より実装しやすい反面、パスワードハッシュ化とセッション管理を雑にすると危険。認証まわりは MVP でも優先的にテストを書く。

## 15. 参考

- [Next.js Authentication Guide](https://nextjs.org/docs/app/guides/authentication)
- [Next.js headers configuration](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers)
- [vercel/next.js Security Advisories](https://github.com/vercel/next.js/security/advisories)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
