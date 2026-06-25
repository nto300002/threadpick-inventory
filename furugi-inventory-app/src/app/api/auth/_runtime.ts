import { createApp } from "@/server/app";
import { MemoryInventoryStore } from "@/server/memory-store";

type AuthGlobal = typeof globalThis & {
  threadpickAuthStore?: MemoryInventoryStore;
};

const authGlobal = globalThis as AuthGlobal;
const existingStore = authGlobal.threadpickAuthStore;
const store =
  existingStore &&
  "purgeExpiredDeletedProducts" in existingStore &&
  "hardDeleteProduct" in existingStore
    ? existingStore
    : new MemoryInventoryStore();

authGlobal.threadpickAuthStore = store;

export const authApi = createApp({
  auth: {
    iterations: 100_000,
    pepper: process.env.AUTH_PEPPER ?? "local-next-auth-pepper",
  },
  store,
});
