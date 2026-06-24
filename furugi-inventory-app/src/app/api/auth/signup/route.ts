import { authApi } from "../_runtime";

export async function POST(request: Request) {
  return authApi.request(request);
}
