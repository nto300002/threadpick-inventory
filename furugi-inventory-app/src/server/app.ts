import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import {
  hashPassword,
  type PasswordHashConfig,
  verifyPassword,
} from "./auth/password";
import { D1InventoryStore } from "./d1-store";
import { DuplicateManagementNumberError, type InventoryStore, type ProductStatus, type PublicUser, type User } from "./store";
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
const priceSchema = z
  .number()
  .int()
  .nonnegative()
  .nullable()
  .optional();
const measurementNumberSchema = z
  .number()
  .nonnegative()
  .nullable()
  .optional();
const productInputSchema = z.object({
  managementNumber: z.string().min(1),
  imageKey: z.string().nullable().optional(),
  colour: z.number().int().nullable().optional(),
  mainCategory: z.string().min(1),
  subCategory: z.string().nullable().optional(),
  size: sizeSchema,
  price: priceSchema,
  note: z.string().nullable().optional(),
});
const measurementSchema = z.object({
  lengthCm: measurementNumberSchema,
  bodyWidthCm: measurementNumberSchema,
  shoulderWidthCm: measurementNumberSchema,
  sleeveLengthCm: measurementNumberSchema,
  waistCm: measurementNumberSchema,
  riseCm: measurementNumberSchema,
  inseamCm: measurementNumberSchema,
  thighWidthCm: measurementNumberSchema,
  hemWidthCm: measurementNumberSchema,
});
const bulkStatusSchema = z.object({
  fromStatus: statusSchema.optional(),
  ids: z.array(z.number().int().positive()).optional(),
  status: statusSchema,
});
const bulkDeleteSchema = z.object({
  status: statusSchema.optional(),
  ids: z.array(z.number().int().positive()).optional(),
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

function duplicateManagementNumberResponse(managementNumber: string) {
  return {
    error: "duplicate_management_number",
    message: `管理番号「${managementNumber}」はすでに登録されています。別の管理番号を入力してください。`,
  };
}

function productInputErrorMessage(issues: z.core.$ZodIssue[]) {
  return issues.some((issue) => issue.path[0] === "price")
    ? "販売価格は0以上の数字のみで入力してください。"
    : "商品情報の入力内容を確認してください。";
}

function measurementInputErrorMessage() {
  return "採寸情報は0以上の数字のみで入力してください。";
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
    await c.get("store").purgeExpiredDeletedProducts();
    const status = c.req.query("status");
    const parsedStatus = status ? statusSchema.safeParse(status) : null;
    if (parsedStatus && !parsedStatus.success) return c.json({ error: "invalid_status" }, 400);
    const statusValue = parsedStatus?.success ? parsedStatus.data : undefined;
    const products = await c.get("store").listProducts({
      includeDeleted: c.req.query("includeDeleted") === "true" || statusValue === "sold",
      status: statusValue,
    });
    return c.json({ products });
  });

  app.post("/api/products", async (c) => {
    const user = c.get("currentUser");
    const unauthorized = requireUser(user);
    if (unauthorized || !user) return c.json(unauthorized, 401);
    const body = productInputSchema.safeParse(await c.req.json());
    if (!body.success) {
      return c.json({ error: "invalid_request", message: productInputErrorMessage(body.error.issues), issues: body.error.issues }, 400);
    }
    try {
      const product = await c.get("store").createProduct({ ...body.data, createdBy: user.id });
      return c.json({ product }, 201);
    } catch (error) {
      if (error instanceof DuplicateManagementNumberError) {
        return c.json(duplicateManagementNumberResponse(error.managementNumber), 409);
      }
      throw error;
    }
  });

  app.get("/api/products/:id", async (c) => {
    const unauthorized = requireUser(c.get("currentUser"));
    if (unauthorized) return c.json(unauthorized, 401);
    const id = parseId(c.req.param("id"));
    if (!id) return c.json({ error: "invalid_id" }, 400);
    const product = await c.get("store").getProduct(id, true);
    return product ? c.json({ product }) : c.json({ error: "not_found" }, 404);
  });

  app.patch("/api/products/:id", async (c) => {
    const user = c.get("currentUser");
    const unauthorized = requireUser(user);
    if (unauthorized || !user) return c.json(unauthorized, 401);
    const id = parseId(c.req.param("id"));
    if (!id) return c.json({ error: "invalid_id" }, 400);
    const body = productInputSchema.partial().safeParse(await c.req.json());
    if (!body.success) {
      return c.json({ error: "invalid_request", message: productInputErrorMessage(body.error.issues), issues: body.error.issues }, 400);
    }
    try {
      const product = await c.get("store").updateProduct(id, { ...body.data, updatedBy: user.id });
      return product ? c.json({ product }) : c.json({ error: "not_found" }, 404);
    } catch (error) {
      if (error instanceof DuplicateManagementNumberError) {
        return c.json(duplicateManagementNumberResponse(error.managementNumber), 409);
      }
      throw error;
    }
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

  app.post("/api/products/bulk/status", async (c) => {
    const user = c.get("currentUser");
    const unauthorized = requireUser(user);
    if (unauthorized || !user) return c.json(unauthorized, 401);
    const body = bulkStatusSchema.safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_request", issues: body.error.issues }, 400);
    const products = await c.get("store").listProducts({
      includeDeleted: body.data.fromStatus === "sold",
      status: body.data.fromStatus,
    });
    const targetIds = body.data.ids ? new Set(body.data.ids) : null;
    const targetProducts = targetIds ? products.filter((product) => targetIds.has(product.id)) : products;
    const updatedProducts = (
      await Promise.all(
        targetProducts.map((product) =>
          c.get("store").updateProductStatus(product.id, body.data.status as ProductStatus, user.id),
        ),
      )
    ).filter((product): product is NonNullable<typeof product> => Boolean(product));
    return c.json({ count: updatedProducts.length, products: updatedProducts });
  });

  app.post("/api/products/bulk/delete", async (c) => {
    const user = c.get("currentUser");
    const unauthorized = requireUser(user);
    if (unauthorized || !user) return c.json(unauthorized, 401);
    const body = bulkDeleteSchema.safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_request", issues: body.error.issues }, 400);
    const products = await c.get("store").listProducts({
      includeDeleted: body.data.status === "sold",
      status: body.data.status,
    });
    const targetIds = body.data.ids ? new Set(body.data.ids) : null;
    const targetProducts = targetIds ? products.filter((product) => targetIds.has(product.id)) : products;
    const deletedResults = await Promise.all(
      targetProducts.map((product) => c.get("store").hardDeleteProduct(product.id)),
    );
    return c.json({ count: deletedResults.filter(Boolean).length, products: targetProducts });
  });

  app.delete("/api/products/:id", async (c) => {
    const user = c.get("currentUser");
    const unauthorized = requireUser(user);
    if (unauthorized || !user) return c.json(unauthorized, 401);
    const id = parseId(c.req.param("id"));
    if (!id) return c.json({ error: "invalid_id" }, 400);
    const deleted = await c.get("store").hardDeleteProduct(id);
    return deleted ? c.json({ ok: true }) : c.json({ error: "not_found" }, 404);
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
    if (!body.success) {
      return c.json({ error: "invalid_request", message: measurementInputErrorMessage(), issues: body.error.issues }, 400);
    }
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
