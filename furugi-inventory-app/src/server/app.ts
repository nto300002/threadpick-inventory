import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import {
  hashPassword,
  type PasswordHashConfig,
  verifyPassword,
} from "./auth/password";
import { D1InventoryStore } from "./d1-store";
import type { InventoryStore, ProductStatus, PublicUser, User } from "./store";
import { toPublicUser } from "./store";

type Bindings = {
  DB: D1Database;
  AUTH_PEPPER?: string;
  PRODUCT_IMAGES: R2Bucket;
};

type Variables = {
  store: InventoryStore;
  currentUser: User | null;
  tokenHash: string | null;
};

const sessionCookie = "threadpick_session";
const sessionHours = 8;
const passwordSchema = z
  .string()
  .min(8, "password must be at least 8 characters")
  .regex(/[A-Z]/, "password must include an uppercase letter")
  .regex(/[a-z]/, "password must include a lowercase letter")
  .regex(/[^A-Za-z0-9]/, "password must include a symbol");

const emailSchema = z
  .string()
  .regex(/^[^\s@]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/);
const roleSchema = z.enum(["admin", "member"]);
const sizeSchema = z.enum(["XS", "S", "M", "L", "XL", "2XL", "3XL", "FREE", "不明"]);
const statusSchema = z.enum(["unmeasured", "measured", "selling", "sold", "returned"]);
const productInputSchema = z.object({
  managementNumber: z.string().min(1),
  imageKey: z.string().nullable().optional(),
  colour: z.number().int().nullable().optional(),
  mainCategory: z.string().min(1),
  subCategory: z.string().nullable().optional(),
  size: sizeSchema,
  price: z.number().int().nullable().optional(),
  note: z.string().nullable().optional(),
});
const measurementSchema = z.object({
  lengthCm: z.number().nullable().optional(),
  bodyWidthCm: z.number().nullable().optional(),
  shoulderWidthCm: z.number().nullable().optional(),
  sleeveLengthCm: z.number().nullable().optional(),
  waistCm: z.number().nullable().optional(),
  riseCm: z.number().nullable().optional(),
  inseamCm: z.number().nullable().optional(),
  thighWidthCm: z.number().nullable().optional(),
  hemWidthCm: z.number().nullable().optional(),
});

async function sha256(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function requireUser(user: User | null) {
  return user ? null : { error: "unauthorized" };
}

function requireAdmin(user: User | null) {
  if (!user) return { error: "unauthorized" };
  return user.role === "admin" ? null : { error: "forbidden" };
}

function publicUserResponse(user: User): PublicUser {
  return toPublicUser(user);
}

export function createApp(options: { auth?: PasswordHashConfig; store?: InventoryStore } = {}) {
  const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

  app.use("*", async (c, next) => {
    const store = options.store ?? new D1InventoryStore(c.env.DB);
    c.set("store", store);
    const token = getCookie(c, sessionCookie);
    if (!token) {
      c.set("currentUser", null);
      c.set("tokenHash", null);
      await next();
      return;
    }
    const tokenHash = await sha256(token);
    const session = await store.findSessionByHash(tokenHash);
    if (!session || session.revokedAt || new Date(session.expiresAt) <= new Date()) {
      c.set("currentUser", null);
      c.set("tokenHash", tokenHash);
      await next();
      return;
    }
    c.set("currentUser", await store.findUserById(session.userId));
    c.set("tokenHash", tokenHash);
    await next();
  });

  app.get("/api/health", (c) =>
    c.json({
      ok: true,
      service: "threadpick-inventory",
    }),
  );

  app.post("/api/auth/signup", async (c) => {
    const body = z
      .object({
        name: z.string().min(1),
        email: emailSchema,
        password: passwordSchema,
        role: roleSchema.default("member"),
      })
      .safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_request", issues: body.error.issues }, 400);
    const store = c.get("store");
    if (await store.findUserByEmail(body.data.email)) {
      return c.json({ error: "email_already_exists" }, 409);
    }
    const existingUsers = await store.listUsers();
    const role = existingUsers.length === 0 ? "admin" : body.data.role;
    const user = await store.createUser({
      name: body.data.name,
      email: body.data.email,
      passwordHash: await hashPassword(body.data.password, {
        pepper: c.env?.AUTH_PEPPER,
        ...options.auth,
      }),
      role,
    });
    return c.json({ user: publicUserResponse(user) }, 201);
  });

  app.post("/api/auth/login", async (c) => {
    const body = z.object({ email: emailSchema, password: z.string().min(1) }).safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_request" }, 400);
    const store = c.get("store");
    const user = await store.findUserByEmail(body.data.email);
    if (
      !user ||
      !(await verifyPassword(body.data.password, user.passwordHash, {
        pepper: c.env?.AUTH_PEPPER,
        ...options.auth,
      }))
    ) {
      return c.json({ error: "invalid_credentials" }, 401);
    }
    const token = randomToken();
    const tokenHash = await sha256(token);
    const expiresAt = new Date(Date.now() + sessionHours * 60 * 60 * 1000).toISOString();
    await store.createSession({ userId: user.id, tokenHash, expiresAt });
    setCookie(c, sessionCookie, token, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: sessionHours * 60 * 60,
    });
    return c.json({ user: publicUserResponse(user) });
  });

  app.post("/api/auth/logout", async (c) => {
    const tokenHash = c.get("tokenHash");
    if (tokenHash) await c.get("store").revokeSession(tokenHash);
    setCookie(c, sessionCookie, "", { path: "/", maxAge: 0 });
    return c.json({ ok: true });
  });

  app.get("/api/auth/me", (c) => {
    const user = c.get("currentUser");
    return user ? c.json({ user: publicUserResponse(user) }) : c.json({ user: null }, 401);
  });

  app.get("/api/products", async (c) => {
    const unauthorized = requireUser(c.get("currentUser"));
    if (unauthorized) return c.json(unauthorized, 401);
    const status = c.req.query("status");
    const parsedStatus = status ? statusSchema.safeParse(status) : null;
    if (parsedStatus && !parsedStatus.success) return c.json({ error: "invalid_status" }, 400);
    const products = await c.get("store").listProducts({
      includeDeleted: c.req.query("includeDeleted") === "true" && c.get("currentUser")?.role === "admin",
      status: parsedStatus?.success ? parsedStatus.data : undefined,
    });
    return c.json({ products });
  });

  app.post("/api/products", async (c) => {
    const user = c.get("currentUser");
    const unauthorized = requireUser(user);
    if (unauthorized || !user) return c.json(unauthorized, 401);
    const body = productInputSchema.safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_request", issues: body.error.issues }, 400);
    const product = await c.get("store").createProduct({ ...body.data, createdBy: user.id });
    return c.json({ product }, 201);
  });

  app.get("/api/products/:id", async (c) => {
    const unauthorized = requireUser(c.get("currentUser"));
    if (unauthorized) return c.json(unauthorized, 401);
    const id = parseId(c.req.param("id"));
    if (!id) return c.json({ error: "invalid_id" }, 400);
    const product = await c.get("store").getProduct(id, c.get("currentUser")?.role === "admin");
    return product ? c.json({ product }) : c.json({ error: "not_found" }, 404);
  });

  app.patch("/api/products/:id", async (c) => {
    const user = c.get("currentUser");
    const unauthorized = requireUser(user);
    if (unauthorized || !user) return c.json(unauthorized, 401);
    const id = parseId(c.req.param("id"));
    if (!id) return c.json({ error: "invalid_id" }, 400);
    const body = productInputSchema.partial().safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_request", issues: body.error.issues }, 400);
    const product = await c.get("store").updateProduct(id, { ...body.data, updatedBy: user.id });
    return product ? c.json({ product }) : c.json({ error: "not_found" }, 404);
  });

  app.patch("/api/products/:id/status", async (c) => {
    const user = c.get("currentUser");
    const unauthorized = requireUser(user);
    if (unauthorized || !user) return c.json(unauthorized, 401);
    const id = parseId(c.req.param("id"));
    if (!id) return c.json({ error: "invalid_id" }, 400);
    const body = z.object({ status: statusSchema }).safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_request" }, 400);
    const product = await c.get("store").updateProductStatus(id, body.data.status as ProductStatus, user.id);
    return product ? c.json({ product }) : c.json({ error: "not_found" }, 404);
  });

  app.delete("/api/products/:id", async (c) => {
    const user = c.get("currentUser");
    const forbidden = requireAdmin(user);
    if (forbidden || !user) return c.json(forbidden, forbidden?.error === "forbidden" ? 403 : 401);
    const id = parseId(c.req.param("id"));
    if (!id) return c.json({ error: "invalid_id" }, 400);
    const product = await c.get("store").softDeleteProduct(id, user.id);
    return product ? c.json({ product }) : c.json({ error: "not_found" }, 404);
  });

  app.get("/api/products/:id/measurement", async (c) => {
    const unauthorized = requireUser(c.get("currentUser"));
    if (unauthorized) return c.json(unauthorized, 401);
    const id = parseId(c.req.param("id"));
    if (!id) return c.json({ error: "invalid_id" }, 400);
    const measurement = await c.get("store").getMeasurement(id);
    return measurement ? c.json({ measurement }) : c.json({ measurement: null }, 404);
  });

  app.put("/api/products/:id/measurement", async (c) => {
    const user = c.get("currentUser");
    const unauthorized = requireUser(user);
    if (unauthorized || !user) return c.json(unauthorized, 401);
    const id = parseId(c.req.param("id"));
    if (!id) return c.json({ error: "invalid_id" }, 400);
    const body = measurementSchema.safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_request", issues: body.error.issues }, 400);
    const measurement = await c.get("store").upsertMeasurement(id, { ...body.data, measuredBy: user.id });
    return c.json({ measurement });
  });

  app.put("/api/products/:id/sale", async (c) => {
    const user = c.get("currentUser");
    const unauthorized = requireUser(user);
    if (unauthorized || !user) return c.json(unauthorized, 401);
    const id = parseId(c.req.param("id"));
    if (!id) return c.json({ error: "invalid_id" }, 400);
    const body = z
      .object({ soldPrice: z.number().int().nullable().optional(), soldAt: z.string().nullable().optional(), memo: z.string().nullable().optional() })
      .safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_request", issues: body.error.issues }, 400);
    const sale = await c.get("store").upsertSale(id, { ...body.data, soldBy: user.id });
    return c.json({ sale });
  });

  app.patch("/api/products/:id/return", async (c) => {
    const user = c.get("currentUser");
    const unauthorized = requireUser(user);
    if (unauthorized || !user) return c.json(unauthorized, 401);
    const id = parseId(c.req.param("id"));
    if (!id) return c.json({ error: "invalid_id" }, 400);
    const sale = await c.get("store").markReturned(id, user.id);
    return sale ? c.json({ sale }) : c.json({ error: "not_found" }, 404);
  });

  app.get("/api/users", async (c) => {
    const forbidden = requireAdmin(c.get("currentUser"));
    if (forbidden) return c.json(forbidden, forbidden.error === "forbidden" ? 403 : 401);
    const users = (await c.get("store").listUsers()).map(toPublicUser);
    return c.json({ users });
  });

  app.post("/api/users", async (c) => {
    const forbidden = requireAdmin(c.get("currentUser"));
    if (forbidden) return c.json(forbidden, forbidden.error === "forbidden" ? 403 : 401);
    const body = z.object({ name: z.string().min(1), email: emailSchema, password: passwordSchema, role: roleSchema }).safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_request", issues: body.error.issues }, 400);
    const user = await c.get("store").createUser({
      name: body.data.name,
      email: body.data.email,
      role: body.data.role,
      passwordHash: await hashPassword(body.data.password, {
        pepper: c.env?.AUTH_PEPPER,
        ...options.auth,
      }),
    });
    return c.json({ user: publicUserResponse(user) }, 201);
  });

  app.patch("/api/users/:id", async (c) => {
    const forbidden = requireAdmin(c.get("currentUser"));
    if (forbidden) return c.json(forbidden, forbidden.error === "forbidden" ? 403 : 401);
    const id = parseId(c.req.param("id"));
    if (!id) return c.json({ error: "invalid_id" }, 400);
    const body = z.object({ role: roleSchema }).safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_request" }, 400);
    const user = await c.get("store").updateUserRole(id, body.data.role);
    return user ? c.json({ user: publicUserResponse(user) }) : c.json({ error: "not_found" }, 404);
  });

  return app;
}

export const app = createApp();

export default app;
