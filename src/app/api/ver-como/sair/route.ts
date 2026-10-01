import { NextResponse } from "next/server";
import { COOKIE_VER_COMO } from "@/lib/ver-como";

export const dynamic = "force-dynamic";

/** Sai do modo "ver como" e volta à visão da Veilig. */
export async function GET(req: Request) {
  const res = NextResponse.redirect(new URL("/ver-como", req.url), 303);
  res.cookies.set(COOKIE_VER_COMO, "", { path: "/", maxAge: 0 });
  return res;
}
