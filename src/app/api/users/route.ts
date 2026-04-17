import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const role = req.nextUrl.searchParams.get("role");
    const db = await getDb();
    let query = `
      SELECT u.id, u.username, u.full_name, u.team, u.role
      FROM users u
    `;
    if (role) {
      query += ` WHERE u.role = @role`;
    }
    query += ` ORDER BY u.full_name`;

    const request = db.request();
    if (role) request.input("role", sql.NVarChar(30), role);
    const r = await request.query(query);
    return NextResponse.json(r.recordset);
  } catch (error) {
    console.error("GET /api/users error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
