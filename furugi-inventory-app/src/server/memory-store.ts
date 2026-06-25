import { DuplicateManagementNumberError } from "./store";
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

const now = () => new Date().toISOString();

export class MemoryInventoryStore implements InventoryStore {
  private userSeq = 1;
  private sessionSeq = 1;
  private productSeq = 1;
  private measurementSeq = 1;
  private saleSeq = 1;
  private users = new Map<number, User>();
  private sessions = new Map<string, Session>();
  private products = new Map<number, Product>();
  private measurements = new Map<number, Measurement>();
  private sales = new Map<number, Sale>();

  async createUser(input: { name: string; email: string; passwordHash: string; role: UserRole }) {
    if ([...this.users.values()].some((user) => user.email === input.email)) {
      throw new Error("email already exists");
    }
    const timestamp = now();
    const user: User = { id: this.userSeq++, createdAt: timestamp, updatedAt: timestamp, ...input };
    this.users.set(user.id, user);
    return user;
  }

  async findUserByEmail(email: string) {
    return [...this.users.values()].find((user) => user.email === email) ?? null;
  }

  async findUserById(id: number) {
    return this.users.get(id) ?? null;
  }

  async listUsers() {
    return [...this.users.values()];
  }

  async updateUserRole(id: number, role: UserRole) {
    const user = this.users.get(id);
    if (!user) return null;
    const updated = { ...user, role, updatedAt: now() };
    this.users.set(id, updated);
    return updated;
  }

  async createSession(input: { userId: number; tokenHash: string; expiresAt: string }) {
    const session: Session = {
      id: this.sessionSeq++,
      revokedAt: null,
      createdAt: now(),
      ...input,
    };
    this.sessions.set(session.tokenHash, session);
    return session;
  }

  async findSessionByHash(tokenHash: string) {
    return this.sessions.get(tokenHash) ?? null;
  }

  async revokeSession(tokenHash: string) {
    const session = this.sessions.get(tokenHash);
    if (session) {
      this.sessions.set(tokenHash, { ...session, revokedAt: now() });
    }
  }

  async listProducts(filters: ProductListFilters = {}) {
    return [...this.products.values()].filter((product) => {
      if (!filters.includeDeleted && product.deletedAt) return false;
      if (filters.status && product.status !== filters.status) return false;
      return true;
    });
  }

  async createProduct(input: ProductInput & { createdBy: number }) {
    if ([...this.products.values()].some((product) => product.managementNumber === input.managementNumber)) {
      throw new DuplicateManagementNumberError(input.managementNumber);
    }
    const timestamp = now();
    const product: Product = {
      id: this.productSeq++,
      imageKey: input.imageKey ?? null,
      colour: input.colour ?? null,
      subCategory: input.subCategory ?? null,
      status: "unmeasured",
      price: input.price ?? null,
      note: input.note ?? null,
      updatedBy: null,
      deletedAt: null,
      deletedBy: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...input,
    };
    this.products.set(product.id, product);
    return product;
  }

  async getProduct(id: number, includeDeleted = false) {
    const product = this.products.get(id) ?? null;
    if (!product || (!includeDeleted && product.deletedAt)) return null;
    return product;
  }

  async updateProduct(id: number, input: ProductPatch & { updatedBy: number }) {
    const product = await this.getProduct(id, true);
    if (!product) return null;
    if (
      input.managementNumber &&
      [...this.products.values()].some(
        (existingProduct) =>
          existingProduct.id !== id && existingProduct.managementNumber === input.managementNumber,
      )
    ) {
      throw new DuplicateManagementNumberError(input.managementNumber);
    }
    const updated = { ...product, ...input, updatedAt: now() };
    this.products.set(id, updated);
    return updated;
  }

  async updateProductStatus(id: number, status: ProductStatus, updatedBy: number) {
    const product = await this.getProduct(id, true);
    if (!product) return null;
    const timestamp = now();
    const updated = {
      ...product,
      status,
      deletedAt: status === "sold" ? product.deletedAt ?? timestamp : null,
      deletedBy: status === "sold" ? updatedBy : null,
      updatedBy,
      updatedAt: timestamp,
    };
    this.products.set(id, updated);
    return updated;
  }

  async restoreProduct(id: number, status: ProductStatus, updatedBy: number) {
    const product = await this.getProduct(id, true);
    if (!product) return null;
    const updated = {
      ...product,
      status,
      deletedAt: null,
      deletedBy: null,
      updatedBy,
      updatedAt: now(),
    };
    this.products.set(id, updated);
    return updated;
  }

  async softDeleteProduct(id: number, deletedBy: number) {
    return this.updateProductStatus(id, "sold", deletedBy);
  }

  async hardDeleteProduct(id: number) {
    const existed = this.products.delete(id);
    this.measurements.delete(id);
    this.sales.delete(id);
    return existed;
  }

  async purgeExpiredDeletedProducts(currentDate = new Date()) {
    const threshold = currentDate.getTime() - 30 * 24 * 60 * 60 * 1000;
    const expiredIds = [...this.products.values()]
      .filter((product) => product.deletedAt && new Date(product.deletedAt).getTime() <= threshold)
      .map((product) => product.id);
    await Promise.all(expiredIds.map((id) => this.hardDeleteProduct(id)));
    return expiredIds.length;
  }

  async getMeasurement(productId: number) {
    return this.measurements.get(productId) ?? null;
  }

  async upsertMeasurement(productId: number, input: MeasurementInput & { measuredBy: number }) {
    const existing = this.measurements.get(productId);
    const timestamp = now();
    const measurement: Measurement = {
      id: existing?.id ?? this.measurementSeq++,
      productId,
      lengthCm: input.lengthCm ?? existing?.lengthCm ?? null,
      bodyWidthCm: input.bodyWidthCm ?? existing?.bodyWidthCm ?? null,
      shoulderWidthCm: input.shoulderWidthCm ?? existing?.shoulderWidthCm ?? null,
      sleeveLengthCm: input.sleeveLengthCm ?? existing?.sleeveLengthCm ?? null,
      waistCm: input.waistCm ?? existing?.waistCm ?? null,
      riseCm: input.riseCm ?? existing?.riseCm ?? null,
      inseamCm: input.inseamCm ?? existing?.inseamCm ?? null,
      thighWidthCm: input.thighWidthCm ?? existing?.thighWidthCm ?? null,
      hemWidthCm: input.hemWidthCm ?? existing?.hemWidthCm ?? null,
      measuredBy: input.measuredBy,
      measuredAt: existing?.measuredAt ?? timestamp,
      updatedAt: timestamp,
    };
    this.measurements.set(productId, measurement);
    await this.updateProductStatus(productId, "measured", input.measuredBy);
    return measurement;
  }

  async upsertSale(productId: number, input: Partial<SaleInput> & { soldBy: number }) {
    const existing = this.sales.get(productId);
    const timestamp = now();
    const sale: Sale = {
      id: existing?.id ?? this.saleSeq++,
      productId,
      soldPrice: input.soldPrice ?? existing?.soldPrice ?? null,
      soldAt: input.soldAt ?? existing?.soldAt ?? timestamp,
      soldBy: input.soldBy,
      isReturned: false,
      returnedAt: null,
      memo: input.memo ?? existing?.memo ?? null,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    this.sales.set(productId, sale);
    await this.updateProductStatus(productId, "sold", input.soldBy);
    return sale;
  }

  async markReturned(productId: number, userId: number) {
    const sale = this.sales.get(productId);
    if (!sale) return null;
    const updated = { ...sale, isReturned: true, returnedAt: now(), updatedAt: now() };
    this.sales.set(productId, updated);
    await this.updateProductStatus(productId, "returned", userId);
    return updated;
  }
}
