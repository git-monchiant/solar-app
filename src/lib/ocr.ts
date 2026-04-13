import Tesseract from "tesseract.js";

export interface IdCardData {
  id_card_number?: string;
  full_name?: string;
  id_card_address?: string;
}

export async function ocrThaiIdCard(imageUrl: string): Promise<IdCardData> {
  const { data } = await Tesseract.recognize(imageUrl, "tha+eng", {
    logger: () => {},
  });

  const text = data.text;
  const result: IdCardData = {};

  // Extract 13-digit ID number
  const idMatch = text.match(/\d[\s.-]*\d[\s.-]*\d{4}[\s.-]*\d{5}[\s.-]*\d{2}[\s.-]*\d/);
  if (idMatch) {
    result.id_card_number = idMatch[0].replace(/[\s.-]/g, "").slice(0, 13);
  } else {
    const digitsOnly = text.replace(/\D/g, "");
    const thirteenMatch = digitsOnly.match(/\d{13}/);
    if (thirteenMatch) result.id_card_number = thirteenMatch[0];
  }

  // Extract name — look for lines after "ชื่อ" or "Name" pattern
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/ชื่อตัว|ชื่อ/.test(line)) {
      const namePart = line.replace(/.*ชื่อตัว|.*ชื่อ/, "").trim();
      const lastNameLine = lines[i + 1] || "";
      const lastName = lastNameLine.replace(/.*นามสกุล/, "").trim();
      if (namePart || lastName) {
        result.full_name = [namePart, lastName].filter(Boolean).join(" ").trim();
      }
      break;
    }
  }

  // Extract address — look for "ที่อยู่" pattern
  for (let i = 0; i < lines.length; i++) {
    if (/ที่อยู่/.test(lines[i])) {
      const addrParts: string[] = [];
      const firstPart = lines[i].replace(/.*ที่อยู่/, "").trim();
      if (firstPart) addrParts.push(firstPart);
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        if (/ออกให้|วันออก|วันหมด|Date|Issue/.test(lines[j])) break;
        addrParts.push(lines[j]);
      }
      if (addrParts.length) result.id_card_address = addrParts.join(" ").trim();
      break;
    }
  }

  return result;
}
