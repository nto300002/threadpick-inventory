import type {
  InventoryStore,
  Measurement,
  MeasurementInput,
  Product,
  ProductInput,
  ProductListFilters,
  ProductPatch,
  ProductStatus,
  Sale,
  SaleInput,
  Session,
  User,
  UserRole,
} from "./store";

type Row = Record<string, unknown>;

const nullable = <T>(value: T | undefined) => value ?? null;
const bool = (value: unknown) => value === true || value === 1;

function userFromRow(row: Row): User {
  return {
    id: Number(row.id),
    name: String(row.name),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    role: row.role as UserRole,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function sessionFromRow(row: Row): Session {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    tokenHash: String(row.token_hash),
    expiresAt: String(row.expires_at),
    revokedAt: row.revoked_at ? String(row.revoked_at) : null,
    createdAt: String(row.created_at),
  };
}

function productFromRow(row: Row): Product {
  return {
    id: Number(row.id),
    managementNumber: String(row.management_number),
    imageKey: row.image_key ? String(row.image_key) : null,
    colour: row.colour == null ? null : Number(row.colour),
    mainCategory: String(row.main_category),
    subCategory: row.sub_category ? String(row.sub_category) : null,
    size: row.size as Product["size"],
    status: row.status as ProductStatus,
    price: row.price == null ? null : Number(row.price),
    note: row.note ? String(row.note) : null,
    createdBy: Number(row.created_by),
    updatedBy: row.updated_by == null ? null : Number(row.updated_by),
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
    deletedBy: row.deleted_by == null ? null : Number(row.deleted_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function measurementFromRow(row: Row): Measurement {
  return {
    id: Number(row.id),
    productId: Number(row.product_id),
    lengthCm: row.length_cm == null ? null : Number(row.length_cm),
    bodyWidthCm: row.body_width_cm == null ? null : Number(row.body_width_cm),
    shoulderWidthCm: row.shoulder_width_cm == null ? null : Number(row.shoulder_width_cm),
    sleeveLengthCm: row.sleeve_length_cm == null ? null : Number(row.sleeve_length_cm),
    waistCm: row.waist_cm == null ? null : Number(row.waist_cm),
    riseCm: row.rise_cm == null ? null : Number(row.rise_cm),
    inseamCm: row.inseam_cm == null ? null : Number(row.inseam_cm),
    thighWidthCm: row.thigh_width_cm == null ? null : Number(row.thigh_width_cm),
    hemWidthCm: row.hem_width_cm == null ? null : Number(row.hem_width_cm),
    measuredBy: Number(row.measured_by),
    measuredAt: String(row.measured_at),
    updatedAt: String(row.updated_at),
  };
}

function saleFromRow(row: Row): Sale {
  return {
    id: Number(row.id),
    productId: Number(row.product_id),
    soldPrice: row.sold_price == null ? null : Number(row.sold_price),
    soldAt: row.sold_at ? String(row.sold_at) : null,
    soldBy: row.sold_by == null ? null : Number(row.sold_by),
    isReturned: bool(row.is_returned),
    returnedAt: row.returned_at ? String(row.returned_at) : null,
    memo: row.memo ? String(row.memo) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

async function first<T>(statement: D1PreparedStatement, mapper: (row: Row) => T): Promise<T | null> {
  const row = await statement.first<Row>();
  return row ? mapper(row) : null;
}

export class D1InventoryStore implements InventoryStore {
  constructor(private readonly db: D1Database) {}

  async createUser(input: { name: string; email: string; passwordHash: string; role: UserRole }) {
    const result = await this.db
      .prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)")
      .bind(input.name, input.email, input.passwordHash, input.role)
      .run();
    return (await this.findUserById(Number(result.meta.last_row_id))) as User;
  }

  async findUserByEmail(email: string) {
    return first(this.db.prepare("SELECT * FROM users WHERE email = ?").bind(email), userFromRow);
  }

  async findUserById(id: number) {
    return first(this.db.prepare("SELECT * FROM users WHERE id = ?").bind(id), userFromRow);
  }

  async listUsers() {
    const result = await this.db.prepare("SELECT * FROM users ORDER BY id").all<Row>();
    return result.results.map(userFromRow);
  }

  async updateUserRole(id: number, role: UserRole) {
    await this.db
      .prepare("UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(role, id)
      .run();
    return this.findUserById(id);
  }

  async createSession(input: { userId: number; tokenHash: string; expiresAt: string }) {
    const result = await this.db
      .prepare("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)")
      .bind(input.userId, input.tokenHash, input.expiresAt)
      .run();
    return first(this.db.prepare("SELECT * FROM sessions WHERE id = ?").bind(result.meta.last_row_id), sessionFromRow) as Promise<Session>;
  }

  async findSessionByHash(tokenHash: string) {
    return first(this.db.prepare("SELECT * FROM sessions WHERE token_hash = ?").bind(tokenHash), sessionFromRow);
  }

  async revokeSession(tokenHash: string) {
    await this.db
      .prepare("UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ?")
      .bind(tokenHash)
      .run();
  }

  async listProducts(filters: ProductListFilters = {}) {
    const clauses = [];
    const values: unknown[] = [];
    if (!filters.includeDeleted) clauses.push("deleted_at IS NULL");
    if (filters.status) {
      clauses.push("status = ?");
      values.push(filters.status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await this.db
      .prepare(`SELECT * FROM products ${where} ORDER BY id DESC`)
      .bind(...values)
      .all<Row>();
    return result.results.map(productFromRow);
  }

  async createProduct(input: ProductInput & { createdBy: number }) {
    const result = await this.db
      .prepare(
        `INSERT INTO products
          (management_number, image_key, colour, main_category, sub_category, size, price, note, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.managementNumber,
        nullable(input.imageKey),
        nullable(input.colour),
        input.mainCategory,
        nullable(input.subCategory),
        input.size,
        nullable(input.price),
        nullable(input.note),
        input.createdBy,
      )
      .run();
    return (await this.getProduct(Number(result.meta.last_row_id))) as Product;
  }

  async getProduct(id: number, includeDeleted = false) {
    const deletedFilter = includeDeleted ? "" : " AND deleted_at IS NULL";
    return first(this.db.prepare(`SELECT * FROM products WHERE id = ?${deletedFilter}`).bind(id), productFromRow);
  }

  async updateProduct(id: number, input: ProductPatch & { updatedBy: number }) {
    const current = await this.getProduct(id);
    if (!current) return null;
    const next = { ...current, ...input };
    await this.db
      .prepare(
        `UPDATE products SET management_number = ?, image_key = ?, colour = ?, main_category = ?,
          sub_category = ?, size = ?, price = ?, note = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .bind(
        next.managementNumber,
        nullable(next.imageKey),
        nullable(next.colour),
        next.mainCategory,
        nullable(next.subCategory),
        next.size,
        nullable(next.price),
        nullable(next.note),
        input.updatedBy,
        id,
      )
      .run();
    return this.getProduct(id);
  }

  async updateProductStatus(id: number, status: ProductStatus, updatedBy: number) {
    await this.db
      .prepare("UPDATE products SET status = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL")
      .bind(status, updatedBy, id)
      .run();
    return this.getProduct(id);
  }

  async softDeleteProduct(id: number, deletedBy: number) {
    await this.db
      .prepare(
        `UPDATE products SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?, updated_by = ?,
          updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`,
      )
      .bind(deletedBy, deletedBy, id)
      .run();
    return this.getProduct(id, true);
  }

  async getMeasurement(productId: number) {
    return first(this.db.prepare("SELECT * FROM measurements WHERE product_id = ?").bind(productId), measurementFromRow);
  }

  async upsertMeasurement(productId: number, input: MeasurementInput & { measuredBy: number }) {
    await this.db
      .prepare(
        `INSERT INTO measurements
          (product_id, length_cm, body_width_cm, shoulder_width_cm, sleeve_length_cm, waist_cm,
           rise_cm, inseam_cm, thigh_width_cm, hem_width_cm, measured_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(product_id) DO UPDATE SET
          length_cm = excluded.length_cm, body_width_cm = excluded.body_width_cm,
          shoulder_width_cm = excluded.shoulder_width_cm, sleeve_length_cm = excluded.sleeve_length_cm,
          waist_cm = excluded.waist_cm, rise_cm = excluded.rise_cm, inseam_cm = excluded.inseam_cm,
          thigh_width_cm = excluded.thigh_width_cm, hem_width_cm = excluded.hem_width_cm,
          measured_by = excluded.measured_by, updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(
        productId,
        nullable(input.lengthCm),
        nullable(input.bodyWidthCm),
        nullable(input.shoulderWidthCm),
        nullable(input.sleeveLengthCm),
        nullable(input.waistCm),
        nullable(input.riseCm),
        nullable(input.inseamCm),
        nullable(input.thighWidthCm),
        nullable(input.hemWidthCm),
        input.measuredBy,
      )
      .run();
    await this.updateProductStatus(productId, "measured", input.measuredBy);
    return (await this.getMeasurement(productId)) as Measurement;
  }

  async upsertSale(productId: number, input: Partial<SaleInput> & { soldBy: number }) {
    await this.db
      .prepare(
        `INSERT INTO sales (product_id, sold_price, sold_at, sold_by, memo)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(product_id) DO UPDATE SET
          sold_price = excluded.sold_price, sold_at = excluded.sold_at,
          sold_by = excluded.sold_by, memo = excluded.memo, is_returned = 0,
          returned_at = NULL, updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(productId, nullable(input.soldPrice), nullable(input.soldAt), input.soldBy, nullable(input.memo))
      .run();
    await this.updateProductStatus(productId, "sold", input.soldBy);
    return first(this.db.prepare("SELECT * FROM sales WHERE product_id = ?").bind(productId), saleFromRow) as Promise<Sale>;
  }

  async markReturned(productId: number, userId: number) {
    await this.db
      .prepare("UPDATE sales SET is_returned = 1, returned_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?")
      .bind(productId)
      .run();
    await this.updateProductStatus(productId, "returned", userId);
    return first(this.db.prepare("SELECT * FROM sales WHERE product_id = ?").bind(productId), saleFromRow);
  }
}
