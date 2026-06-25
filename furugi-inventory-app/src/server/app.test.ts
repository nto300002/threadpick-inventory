import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { MemoryInventoryStore } from "./memory-store";

function setup() {
  const store = new MemoryInventoryStore();
  const app = createApp({
    auth: {
      iterations: 1_000,
      pepper: "test-pepper",
    },
    store,
  });
  return { app, store };
}

async function json<T>(response: Response) {
  return (await response.json()) as T;
}

async function createUserSession(
  app: ReturnType<typeof createApp>,
  input: { name?: string; email: string; password?: string; role?: "admin" | "member" },
) {
  await app.request("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      name: input.name ?? "User",
      email: input.email,
      password: input.password ?? "Password!1",
      role: input.role ?? "member",
    }),
    headers: { "content-type": "application/json" },
  });
  const login = await app.request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: input.email, password: input.password ?? "Password!1" }),
    headers: { "content-type": "application/json" },
  });
  return login.headers.get("set-cookie") ?? "";
}

describe("Hono API", () => {
  it("responds to the health endpoint", async () => {
    const { app } = setup();
    const response = await app.request("/api/health");

    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "threadpick-inventory",
    });
  });

  it("signs up the first user as admin and creates an authenticated session", async () => {
    const { app, store } = setup();

    const signup = await app.request("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        name: "Owner",
        email: "owner@example.com",
        password: "Password!1",
      }),
      headers: { "content-type": "application/json" },
    });
    expect(signup.status).toBe(201);
    await expect(json<{ user: { role: string; passwordHash?: string } }>(signup)).resolves.toMatchObject({
      user: { role: "admin" },
    });
    const storedUser = await store.findUserByEmail("owner@example.com");
    expect(storedUser?.passwordHash).toMatch(/^pbkdf2-sha256\$i=1000\$/);
    expect(storedUser?.passwordHash).not.toContain("Password!1");

    const login = await app.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "owner@example.com", password: "Password!1" }),
      headers: { "content-type": "application/json" },
    });
    expect(login.status).toBe(200);
    expect(login.headers.get("set-cookie")).toContain("threadpick_session=");
    expect(login.headers.get("set-cookie")).toContain("HttpOnly");
    expect(login.headers.get("set-cookie")).toContain("Secure");
    expect(login.headers.get("set-cookie")).toContain("SameSite=Lax");
    expect(login.headers.get("set-cookie")).toContain("Max-Age=28800");

    const me = await app.request("/api/auth/me", {
      headers: { cookie: login.headers.get("set-cookie") ?? "" },
    });
    expect(me.status).toBe(200);
    await expect(json<{ user: { email: string; passwordHash?: string } }>(me)).resolves.toMatchObject({
      user: { email: "owner@example.com" },
    });
  });

  it("enforces password complexity and generic login failures", async () => {
    const { app } = setup();

    const weakSignup = await app.request("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        name: "Owner",
        email: "owner@example.com",
        password: "password",
      }),
      headers: { "content-type": "application/json" },
    });
    expect(weakSignup.status).toBe(400);
    await expect(json<{ error: string; issues: Array<{ message: string }> }>(weakSignup)).resolves.toMatchObject({
      error: "invalid_request",
      issues: expect.arrayContaining([
        expect.objectContaining({ message: "password must include an uppercase letter" }),
        expect.objectContaining({ message: "password must include a symbol" }),
      ]),
    });

    await app.request("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        name: "Owner",
        email: "owner@example.com",
        password: "Password!1",
      }),
      headers: { "content-type": "application/json" },
    });
    const badLogin = await app.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "missing@example.com", password: "wrong" }),
      headers: { "content-type": "application/json" },
    });
    expect(badLogin.status).toBe(401);
    await expect(json<{ error: string }>(badLogin)).resolves.toEqual({
      error: "invalid_credentials",
    });
  });

  it("creates products and supports measurement, sale, and return workflows", async () => {
    const { app } = setup();
    const cookie = await createUserSession(app, { email: "owner@example.com" });

    const createProduct = await app.request("/api/products", {
      method: "POST",
      body: JSON.stringify({
        managementNumber: "TP-2001",
        imageKey: "products/tp-2001.jpg",
        colour: 12,
        mainCategory: "トップス",
        subCategory: "スウェット",
        size: "M",
        price: 6800,
        note: "good condition",
      }),
      headers: { "content-type": "application/json", cookie },
    });
    expect(createProduct.status).toBe(201);
    const created = await json<{ product: { id: number; status: string } }>(createProduct);
    expect(created.product.status).toBe("unmeasured");

    const measurement = await app.request(`/api/products/${created.product.id}/measurement`, {
      method: "PUT",
      body: JSON.stringify({ lengthCm: 68, bodyWidthCm: 54.5, sleeveLengthCm: 59 }),
      headers: { "content-type": "application/json", cookie },
    });
    expect(measurement.status).toBe(200);
    await expect(json<{ measurement: { lengthCm: number } }>(measurement)).resolves.toMatchObject({
      measurement: { lengthCm: 68 },
    });

    const afterMeasurement = await app.request(`/api/products/${created.product.id}`, {
      headers: { cookie },
    });
    await expect(json<{ product: { status: string } }>(afterMeasurement)).resolves.toMatchObject({
      product: { status: "measured" },
    });

    const sale = await app.request(`/api/products/${created.product.id}/sale`, {
      method: "PUT",
      body: JSON.stringify({ soldPrice: 6400, memo: "店頭販売" }),
      headers: { "content-type": "application/json", cookie },
    });
    expect(sale.status).toBe(200);
    const soldProduct = await app.request(`/api/products/${created.product.id}`, {
      headers: { cookie },
    });
    await expect(json<{ product: { status: string; deletedAt: string | null } }>(soldProduct)).resolves.toMatchObject({
      product: { status: "sold", deletedAt: expect.any(String) },
    });

    const returned = await app.request(`/api/products/${created.product.id}/return`, {
      method: "PATCH",
      headers: { cookie },
    });
    expect(returned.status).toBe(200);

    const products = await app.request("/api/products?status=returned", { headers: { cookie } });
    const list = await json<{ products: Array<{ managementNumber: string; status: string }> }>(products);
    expect(list.products).toEqual([
      expect.objectContaining({ managementNumber: "TP-2001", status: "returned" }),
    ]);
  });

  it("rejects duplicate product management numbers with a Japanese message", async () => {
    const { app } = setup();
    const cookie = await createUserSession(app, { email: "owner@example.com" });
    const body = { managementNumber: "TP-2001", mainCategory: "トップス", size: "M" };

    const first = await app.request("/api/products", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", cookie },
    });
    expect(first.status).toBe(201);

    const duplicate = await app.request("/api/products", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", cookie },
    });
    expect(duplicate.status).toBe(409);
    await expect(json<{ error: string; message: string }>(duplicate)).resolves.toEqual({
      error: "duplicate_management_number",
      message: "管理番号「TP-2001」はすでに登録されています。別の管理番号を入力してください。",
    });
  });

  it("rejects non-numeric price and measurement values with Japanese messages", async () => {
    const { app } = setup();
    const cookie = await createUserSession(app, { email: "owner@example.com" });

    const invalidPrice = await app.request("/api/products", {
      method: "POST",
      body: JSON.stringify({
        managementNumber: "TP-2002",
        mainCategory: "トップス",
        size: "M",
        price: "6800円",
      }),
      headers: { "content-type": "application/json", cookie },
    });
    expect(invalidPrice.status).toBe(400);
    await expect(json<{ error: string; message: string }>(invalidPrice)).resolves.toMatchObject({
      error: "invalid_request",
      message: "販売価格は0以上の数字のみで入力してください。",
    });

    const productResponse = await app.request("/api/products", {
      method: "POST",
      body: JSON.stringify({ managementNumber: "TP-2003", mainCategory: "トップス", size: "M" }),
      headers: { "content-type": "application/json", cookie },
    });
    const product = await json<{ product: { id: number } }>(productResponse);
    const invalidMeasurement = await app.request(`/api/products/${product.product.id}/measurement`, {
      method: "PUT",
      body: JSON.stringify({ lengthCm: "68cm" }),
      headers: { "content-type": "application/json", cookie },
    });
    expect(invalidMeasurement.status).toBe(400);
    await expect(json<{ error: string; message: string }>(invalidMeasurement)).resolves.toMatchObject({
      error: "invalid_request",
      message: "採寸情報は0以上の数字のみで入力してください。",
    });
  });

  it("treats sold products as 30-day retention records and deletes physically on delete", async () => {
    const { app } = setup();
    const adminCookie = await createUserSession(app, { email: "owner@example.com" });
    const memberCookie = await createUserSession(app, { email: "member@example.com" });

    const productResponse = await app.request("/api/products", {
      method: "POST",
      body: JSON.stringify({ managementNumber: "TP-2002", mainCategory: "バッグ", size: "FREE" }),
      headers: { "content-type": "application/json", cookie: adminCookie },
    });
    const product = await json<{ product: { id: number } }>(productResponse);

    const sold = await app.request(`/api/products/${product.product.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "sold" }),
      headers: { "content-type": "application/json", cookie: memberCookie },
    });
    expect(sold.status).toBe(200);
    await expect(json<{ product: { deletedAt: string | null; status: string } }>(sold)).resolves.toMatchObject({
      product: { deletedAt: expect.any(String), status: "sold" },
    });

    const soldProducts = await app.request("/api/products?status=sold", {
      headers: { cookie: memberCookie },
    });
    await expect(json<{ products: Array<{ managementNumber: string; deletedAt: string | null }> }>(soldProducts)).resolves.toMatchObject({
      products: [expect.objectContaining({ managementNumber: "TP-2002", deletedAt: expect.any(String) })],
    });

    const restore = await app.request(`/api/products/${product.product.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "selling" }),
      headers: { "content-type": "application/json", cookie: memberCookie },
    });
    expect(restore.status).toBe(200);
    await expect(json<{ product: { deletedAt: string | null; status: string } }>(restore)).resolves.toMatchObject({
      product: { deletedAt: null, status: "selling" },
    });

    const hardDelete = await app.request(`/api/products/${product.product.id}`, {
      method: "DELETE",
      headers: { cookie: memberCookie },
    });
    expect(hardDelete.status).toBe(200);
    await expect(json<{ ok: boolean }>(hardDelete)).resolves.toEqual({ ok: true });

    const afterDelete = await app.request("/api/products?includeDeleted=true", {
      headers: { cookie: adminCookie },
    });
    await expect(json<{ products: Array<{ managementNumber: string }> }>(afterDelete)).resolves.toEqual({
      products: [],
    });

    const users = await app.request("/api/users", { headers: { cookie: adminCookie } });
    expect(users.status).toBe(200);
    const userList = await json<{ users: Array<{ email: string; passwordHash?: string }> }>(users);
    expect(userList.users).toEqual(
      expect.arrayContaining([expect.objectContaining({ email: "member@example.com" })]),
    );
    expect(userList.users[0]).not.toHaveProperty("passwordHash");
  });

  it("bulk-updates product statuses and bulk-deletes sold products", async () => {
    const { app } = setup();
    const adminCookie = await createUserSession(app, { email: "owner@example.com" });
    const memberCookie = await createUserSession(app, { email: "member@example.com" });

    async function createProduct(managementNumber: string) {
      const response = await app.request("/api/products", {
        method: "POST",
        body: JSON.stringify({ managementNumber, mainCategory: "トップス", size: "M" }),
        headers: { "content-type": "application/json", cookie: adminCookie },
      });
      expect(response.status).toBe(201);
      return json<{ product: { id: number; status: string; managementNumber: string } }>(response);
    }

    const first = await createProduct("TP-3001");
    const second = await createProduct("TP-3002");
    const third = await createProduct("TP-3003");

    await app.request(`/api/products/${first.product.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "selling" }),
      headers: { "content-type": "application/json", cookie: adminCookie },
    });
    await app.request(`/api/products/${second.product.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "selling" }),
      headers: { "content-type": "application/json", cookie: adminCookie },
    });

    const soldBulk = await app.request("/api/products/bulk/status", {
      method: "POST",
      body: JSON.stringify({ fromStatus: "selling", status: "sold" }),
      headers: { "content-type": "application/json", cookie: memberCookie },
    });
    expect(soldBulk.status).toBe(200);
    await expect(json<{ products: Array<{ status: string; deletedAt: string | null }>; count: number }>(soldBulk)).resolves.toMatchObject({
      count: 2,
      products: [
        expect.objectContaining({ status: "sold", deletedAt: expect.any(String) }),
        expect.objectContaining({ status: "sold", deletedAt: expect.any(String) }),
      ],
    });

    const remaining = await app.request(`/api/products/${third.product.id}`, {
      headers: { cookie: adminCookie },
    });
    await expect(json<{ product: { status: string } }>(remaining)).resolves.toMatchObject({
      product: { status: "unmeasured" },
    });

    const deletedBulk = await app.request("/api/products/bulk/delete", {
      method: "POST",
      body: JSON.stringify({ status: "sold" }),
      headers: { "content-type": "application/json", cookie: memberCookie },
    });
    expect(deletedBulk.status).toBe(200);
    await expect(json<{ products: Array<{ status: string; deletedAt: string | null }>; count: number }>(deletedBulk)).resolves.toMatchObject({
      count: 2,
      products: [
        expect.objectContaining({ status: "sold", deletedAt: expect.any(String) }),
        expect.objectContaining({ status: "sold", deletedAt: expect.any(String) }),
      ],
    });

    const activeProducts = await app.request("/api/products", { headers: { cookie: adminCookie } });
    await expect(json<{ products: Array<{ managementNumber: string }> }>(activeProducts)).resolves.toEqual({
      products: [expect.objectContaining({ managementNumber: "TP-3003" })],
    });
  });
});
