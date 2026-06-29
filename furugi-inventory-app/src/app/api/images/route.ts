import { authApi } from "../auth/_runtime";

export async function POST(request: Request) {
  return authApi.request(request);
}
