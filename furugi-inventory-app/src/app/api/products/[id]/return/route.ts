import { authApi } from "../../../auth/_runtime";

export async function PATCH(request: Request) {
  return authApi.request(request);
}
