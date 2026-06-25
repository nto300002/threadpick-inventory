import { authApi } from "../../auth/_runtime";

export async function GET(request: Request) {
  return authApi.request(request);
}

export async function PATCH(request: Request) {
  return authApi.request(request);
}

export async function DELETE(request: Request) {
  return authApi.request(request);
}
