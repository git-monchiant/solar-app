import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  if (!q) return NextResponse.json({ error: "missing q" }, { status: 400 });
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&accept-language=th&countrycodes=th&limit=1`,
      { headers: { "User-Agent": "sena-solar-app/1.0" } }
    );
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("geocode error:", err);
    return NextResponse.json({ error: "geocode failed" }, { status: 500 });
  }
}
