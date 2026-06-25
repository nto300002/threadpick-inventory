export type UserRole = "admin" | "member";
export type ProductStatus = "unmeasured" | "measured" | "selling" | "sold" | "returned";
export type ProductSize = "XS" | "S" | "M" | "L" | "XL" | "2XL" | "3XL" | "FREE" | "不明";

export class DuplicateManagementNumberError extends Error {
  constructor(readonly managementNumber: string) {
    super(`Duplicate management number: ${managementNumber}`);
    this.name = "DuplicateManagementNumberError";
  }
}

export type User = {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
};

export type PublicUser = Omit<User, "passwordHash">;

export type Session = {
  id: number;
  userId: number;
  tokenHash: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
};

export type Product = {
  id: number;
  managementNumber: string;
  imageKey: string | null;
  colour: number | null;
  mainCategory: string;
  subCategory: string | null;
  size: ProductSize;
  status: ProductStatus;
  price: number | null;
  note: string | null;
  createdBy: number;
  updatedBy: number | null;
  deletedAt: string | null;
  deletedBy: number | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductInput = {
  managementNumber: string;
  imageKey?: string | null;
  colour?: number | null;
  mainCategory: string;
  subCategory?: string | null;
  size: ProductSize;
  price?: number | null;
  note?: string | null;
};

export type ProductPatch = Partial<ProductInput>;

export type Measurement = {
  id: number;
  productId: number;
  lengthCm: number | null;
  bodyWidthCm: number | null;
  shoulderWidthCm: number | null;
  sleeveLengthCm: number | null;
  waistCm: number | null;
  riseCm: number | null;
  inseamCm: number | null;
  thighWidthCm: number | null;
  hemWidthCm: number | null;
  measuredBy: number;
  measuredAt: string;
  updatedAt: string;
};

export type MeasurementInput = Partial<
  Pick<
    Measurement,
    | "lengthCm"
    | "bodyWidthCm"
    | "shoulderWidthCm"
    | "sleeveLengthCm"
    | "waistCm"
    | "riseCm"
    | "inseamCm"
    | "thighWidthCm"
    | "hemWidthCm"
  >
>;

export type Sale = {
  id: number;
  productId: number;
  soldPrice: number | null;
  soldAt: string | null;
  soldBy: number | null;
  isReturned: boolean;
  returnedAt: string | null;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SaleInput = Pick<Sale, "soldPrice" | "soldAt" | "memo">;

export type ProductListFilters = {
  includeDeleted?: boolean;
  status?: ProductStatus;
};

export interface InventoryStore {
  createUser(input: { name: string; email: string; passwordHash: string; role: UserRole }): Promise<User>;
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(id: number): Promise<User | null>;
  listUsers(): Promise<User[]>;
  updateUserRole(id: number, role: UserRole): Promise<User | null>;
  createSession(input: { userId: number; tokenHash: string; expiresAt: string }): Promise<Session>;
  findSessionByHash(tokenHash: string): Promise<Session | null>;
  revokeSession(tokenHash: string): Promise<void>;
  listProducts(filters?: ProductListFilters): Promise<Product[]>;
  createProduct(input: ProductInput & { createdBy: number }): Promise<Product>;
  getProduct(id: number, includeDeleted?: boolean): Promise<Product | null>;
  updateProduct(id: number, input: ProductPatch & { updatedBy: number }): Promise<Product | null>;
  updateProductStatus(id: number, status: ProductStatus, updatedBy: number): Promise<Product | null>;
  softDeleteProduct(id: number, deletedBy: number): Promise<Product | null>;
  restoreProduct(id: number, status: ProductStatus, updatedBy: number): Promise<Product | null>;
  hardDeleteProduct(id: number): Promise<boolean>;
  purgeExpiredDeletedProducts(now?: Date): Promise<number>;
  getMeasurement(productId: number): Promise<Measurement | null>;
  upsertMeasurement(productId: number, input: MeasurementInput & { measuredBy: number }): Promise<Measurement>;
  upsertSale(productId: number, input: Partial<SaleInput> & { soldBy: number }): Promise<Sale>;
  markReturned(productId: number, userId: number): Promise<Sale | null>;
}

export function toPublicUser(user: User): PublicUser {
  const publicUser = { ...user };
  delete (publicUser as Partial<User>).passwordHash;
  return publicUser;
}
