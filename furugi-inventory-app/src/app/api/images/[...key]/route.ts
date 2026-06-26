import { authApi } from "../../auth/_runtime";

export async function GET(request: Request) {
  return authApi.request(request);
}
