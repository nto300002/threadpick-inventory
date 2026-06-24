import { createApp } from "@/server/app";
import { MemoryInventoryStore } from "@/server/memory-store";

type AuthGlobal = typeof globalThis & {
  threadpickAuthStore?: MemoryInventoryStore;
};

const authGlobal = globalThis as AuthGlobal;
const store = authGlobal.threadpickAuthStore ?? new MemoryInventoryStore();

authGlobal.threadpickAuthStore = store;

export const authApi = createApp({
  auth: {
    iterations: 100_000,
    pepper: process.env.AUTH_PEPPER ?? "local-next-auth-pepper",
  },
  store,
});
