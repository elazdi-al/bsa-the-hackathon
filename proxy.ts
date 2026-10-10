import { NextResponse } from "next/server";
import { isSunset } from "@/lib/wallet/sunset.ts";

export function proxy() {
  return isSunset() ? NextResponse.json({ error: "Swissquote's services are closed." }, { status: 503 }) : NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
