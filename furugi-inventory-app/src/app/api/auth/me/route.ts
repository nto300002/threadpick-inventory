import { authApi } from "../_runtime";

export async function GET(request: Request) {
  return authApi.request(request);
}
