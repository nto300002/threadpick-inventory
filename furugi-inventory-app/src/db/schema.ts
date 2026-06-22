import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["admin", "member"] }).notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("idx_users_email").on(table.email)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_sessions_token_hash").on(table.tokenHash),
    index("idx_sessions_user_id").on(table.userId),
    index("idx_sessions_expires_at").on(table.expiresAt),
  ],
);

export const products = sqliteTable(
  "products",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    managementNumber: text("management_number").notNull(),
    imageKey: text("image_key"),
    colour: integer("colour"),
    mainCategory: text("main_category").notNull(),
    subCategory: text("sub_category"),
    size: text("size", {
      enum: ["XS", "S", "M", "L", "XL", "2XL", "3XL", "FREE", "不明"],
    }).notNull(),
    status: text("status", {
      enum: ["unmeasured", "measured", "selling", "sold", "returned"],
    })
      .notNull()
      .default("unmeasured"),
    price: integer("price"),
    note: text("note"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    updatedBy: integer("updated_by").references(() => users.id),
    deletedAt: text("deleted_at"),
    deletedBy: integer("deleted_by").references(() => users.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_products_status").on(table.status),
    index("idx_products_management_number").on(table.managementNumber),
    index("idx_products_deleted_at").on(table.deletedAt),
  ],
);

export const measurements = sqliteTable("measurements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id")
    .notNull()
    .unique()
    .references(() => products.id),
  lengthCm: real("length_cm"),
  bodyWidthCm: real("body_width_cm"),
  shoulderWidthCm: real("shoulder_width_cm"),
  sleeveLengthCm: real("sleeve_length_cm"),
  waistCm: real("waist_cm"),
  riseCm: real("rise_cm"),
  inseamCm: real("inseam_cm"),
  thighWidthCm: real("thigh_width_cm"),
  hemWidthCm: real("hem_width_cm"),
  measuredBy: integer("measured_by")
    .notNull()
    .references(() => users.id),
  measuredAt: text("measured_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const sales = sqliteTable("sales", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id")
    .notNull()
    .unique()
    .references(() => products.id),
  soldPrice: integer("sold_price"),
  soldAt: text("sold_at"),
  soldBy: integer("sold_by").references(() => users.id),
  isReturned: integer("is_returned", { mode: "boolean" }).notNull().default(false),
  returnedAt: text("returned_at"),
  memo: text("memo"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const productRelations = relations(products, ({ one }) => ({
  creator: one(users, {
    fields: [products.createdBy],
    references: [users.id],
  }),
  measurement: one(measurements, {
    fields: [products.id],
    references: [measurements.productId],
  }),
  sale: one(sales, {
    fields: [products.id],
    references: [sales.productId],
  }),
}));

export const userRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
}));

export const sessionRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));
