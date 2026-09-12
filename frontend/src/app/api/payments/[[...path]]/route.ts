import { NextRequest } from "next/server";
import { commerceProxy } from "@/lib/commerce-proxy";
async function handle(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return commerceProxy(request, "payments", (await context.params).path?.join("/") ?? "config");
}
export const GET = handle;
export const POST = handle;
