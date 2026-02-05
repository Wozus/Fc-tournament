import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";

export async function GET() {
  const { user, error } = await getSessionUser();
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({ user });
}
