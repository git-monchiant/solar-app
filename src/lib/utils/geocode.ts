// Look up Thai district/province for a project name via OpenStreetMap Nominatim (free).
// Returns { district, province } or null if not found.
export async function geocodeThaiPlace(name: string): Promise<{ district: string | null; province: string | null } | null> {
  try {
    const q = `${name} ประเทศไทย`;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&accept-language=th&countrycodes=th&limit=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "sena-solar-app/1.0 (internal use)" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.length) return null;
    const addr = data[0].address || {};
    const district = addr.county || addr.city_district || addr.district || addr.suburb || null;
    const province = addr.state || addr.province || null;
    if (!district && !province) return null;
    return { district, province };
  } catch {
    return null;
  }
}
