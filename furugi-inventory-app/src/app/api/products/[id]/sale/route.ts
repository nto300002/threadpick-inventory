import { authApi } from "../../../auth/_runtime";

export async function PUT(request: Request) {
  return authApi.request(request);
}
