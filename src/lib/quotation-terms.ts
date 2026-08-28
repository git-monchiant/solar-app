export type QuotationTermsProfile = "full_install" | "additional_install";

export type QuotationPaymentTerm = {
  label: string;
  percent: number;
  due: string;
};

export type QuotationOmService = {
  enabled: boolean;
  visits_per_year: number;
  years: number;
};

export type QuotationOmSettings = {
  enabled: boolean;
  coverage_years: number;
  cleaning: QuotationOmService;
  thermoscan: QuotationOmService;
  visual_inspection: QuotationOmService;
};

export type QuotationLegalSection = {
  title: string;
  paragraphs: string[];
};

export type QuotationLegalContent = {
  profile: QuotationTermsProfile;
  page1Sections: QuotationLegalSection[];
  page2LeadingParagraphs: string[];
  page2Sections: QuotationLegalSection[];
};

// ── โครงต้นไม้ของเงื่อนไข ───────────────────────────────────────────────
// เก็บแต่ "เนื้อความ" ไม่มีเลขข้อนำหน้า — เลข 1.1 / 2.3 / 3.1 ไล่ตอนเรนเดอร์
// ทำให้แทรก ลบ และสลับลำดับได้โดยเลขไม่ชนกัน และหัวข้อที่ถูกซ่อนจะทำให้
// หัวข้อถัดไปเลื่อนเลขขึ้นมาเอง (ปิด O&M แล้ว "เงื่อนไขเพิ่มเติม" เด้ง 4 → 3)

/** เงื่อนไขการแสดงผลของบรรทัด/หัวข้อ — ประเมินจากการตั้งค่า O&M ของใบนั้น */
export type QuotationTermVisibility =
  | "always"
  | "om_visible"
  | "om_cleaning"
  | "om_thermoscan"
  | "om_visual";

export type QuotationTermLine = {
  key: string;
  /** เนื้อความ ไม่มีเลขข้อ อาจมี {{placeholder}} */
  body: string;
  /** หน้าที่บรรทัดนี้ไปโผล่ (หัวข้อ 2 มีบรรทัดคร่อม 2 หน้า) */
  page: 1 | 2;
  showWhen?: QuotationTermVisibility;
  /** ข้อกฎหมายที่ลบและแก้ถ้อยคำไม่ได้ (เลื่อนลำดับได้) */
  locked?: boolean;
  /** standard = มาจากชุดในโค้ด · custom = ผู้ใช้เพิ่มเองในใบนั้น */
  origin?: "standard" | "custom";
};

export type QuotationTermSection = {
  key: string;
  /** ชื่อหัวข้อ ไม่มีเลขนำหน้า อาจมี {{placeholder}} */
  title: string;
  /** หน้าที่ "ชื่อหัวข้อ" ไปโผล่ */
  page: 1 | 2;
  showWhen?: QuotationTermVisibility;
  /** om_services = บล็อกที่แต่ละบรรทัดผูกกับบริการ O&M ตัวหนึ่ง */
  kind?: "normal" | "om_services";
  lines: QuotationTermLine[];
};

export type QuotationTermTree = {
  profile: QuotationTermsProfile;
  sections: QuotationTermSection[];
  /** ข้อมาตรฐานที่ถูกลบไป เก็บไว้ให้กด "คืนข้อที่ลบ" ได้ */
  removed?: QuotationTermLine[];
};

/** ปุ่ม "แทรกค่า" ในหน้าจอ — ผู้ใช้ไม่ต้องพิมพ์ {{...}} เอง */
export const QUOTATION_TERM_PLACEHOLDERS: ReadonlyArray<
  Readonly<{ key: string; label: string; omServiceOnly?: boolean }>
> = Object.freeze([
  Object.freeze({ key: "valid_days", label: "จำนวนวันยืนราคา" }),
  Object.freeze({ key: "om_years", label: "จำนวนปี O&M" }),
  Object.freeze({ key: "om_visits_phrase", label: "ข้อความ “ปีละ N ครั้ง”" }),
  Object.freeze({ key: "service_visits", label: "จำนวนครั้ง/ปี ของบริการนี้", omServiceOnly: true }),
  Object.freeze({ key: "service_years", label: "จำนวนปี ของบริการนี้", omServiceOnly: true }),
]);

const WARRANTY_LINES: QuotationTermLine[] = [
  { key: "w-panel", page: 1, body: "การรับประกัน แผงโซลาร์เซลล์ PRODUCTION WARRANTY และ รับประกัน PERFORMANCE WARRANTY โดยจะรับประกันจากผู้ผลิต" },
  { key: "w-inverter", page: 1, body: "การรับประกัน INVERTER รับประกันมาตรฐาน โดยรับประกันจากผู้ผลิต" },
  { key: "w-battery", page: 1, body: "การรับประกัน BATTERY รับประกันมาตรฐาน โดยรับประกันจากผู้ผลิต" },
  { key: "w-validity", page: 1, body: "ยืนยันราคาภายใน {{valid_days}} วัน นับจากวันที่ออกเอกสารใบเสนอราคา" },
];

const SHARED_NOTE_LINES: QuotationTermLine[] = [
  { key: "n-permit", page: 1, body: "ราคาดังกล่าวรวมค่าใช้จ่ายในการขอใบอนุญาต ได้แก่ ใบอนุญาตขนานไฟ เอกสารนอกเหนือจากนี้จะมีค่าใช้จ่ายเพิ่มเติม" },
  { key: "n-wiring", page: 1, body: "ราคานี้ไม่รวมงานปรับปรุงระบบและสายไฟฟ้าเพิ่มเติมภายในบ้าน ทางบริษัทฯ ยินดีเสนอราคาเพิ่มเติมตามความเหมาะสมของหน้างาน" },
  { key: "n-change", page: 1, locked: true, body: "หากมีการเปลี่ยนแปลงจากที่ตกลง บริษัทฯ ขอสงวนสิทธิ์คิดค่าใช้จ่ายเป็นงานเพิ่ม" },
  { key: "n-meter", page: 1, body: "บ้านที่จะติดตั้งระบบโซลาร์เซลล์ ต้องยื่นขออนุญาตเรียบร้อยแล้ว พร้อมมีบ้านเลขที่และติดตั้งมิเตอร์จากการไฟฟ้าเป็นมิเตอร์ไฟจริงแล้ว" },
];

const EXTRA_LINES: QuotationTermLine[] = [
  { key: "x-estimate", page: 2, body: "ใบเสนอราคานี้เป็นเพียงการประมาณการเบื้องต้น หากติดตั้งจริงอาจมีการเปลี่ยนแปลงราคาในภายหลัง" },
  { key: "x-equipment", page: 2, body: "ผู้ขายขอสงวนสิทธิ์ในการเลือกใช้อุปกรณ์ในการติดตั้งระบบโซลาร์เซลล์" },
  { key: "x-deposit", page: 2, body: "เงินค่าจองเพื่อซื้อระบบโซลาร์เซลล์ จะถูกคืนให้ลูกค้าโดยหักจากยอดเงินที่ลูกค้าโอนชำระเมื่อตกลงซื้อระบบโซลาร์เซลล์" },
];

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** ชุดเงื่อนไขมาตรฐานของบริษัท — แหล่งความจริงเดียว แก้ที่นี่แล้ว deploy */
export function getStandardQuotationTermTree(
  profile: QuotationTermsProfile,
): QuotationTermTree {
  if (profile === "additional_install") {
    return clone({
      profile,
      sections: [
        { key: "warranty", page: 1, title: "รายละเอียดการรับประกันสินค้า", lines: WARRANTY_LINES },
        {
          key: "notes",
          page: 1,
          title: "เงื่อนไขรับประกันงานติดตั้ง (กรณีเฉพาะติดตั้งเพิ่ม)",
          lines: [
            ...SHARED_NOTE_LINES,
            { key: "n-install-warranty-add", page: 2, body: "รับประกันงานติดตั้งเฉพาะอุปกรณ์ที่ติดตั้งเพิ่มเท่านั้น" },
          ],
        },
        { key: "extra", page: 2, title: "เงื่อนไขเพิ่มเติม", lines: EXTRA_LINES },
      ],
    });
  }
  return clone({
    profile,
    sections: [
      { key: "warranty", page: 1, title: "รายละเอียดการรับประกันสินค้า", lines: WARRANTY_LINES },
      {
        key: "notes",
        page: 1,
        title: "หมายเหตุ (กรณีติดตั้งใหม่ทั้งระบบ)",
        lines: [
          ...SHARED_NOTE_LINES,
          { key: "n-install-warranty", page: 2, body: "รับประกันงานติดตั้งระบบโซลาร์เซลล์ เป็นระยะเวลา 2 ปี" },
          { key: "n-om-summary", page: 2, showWhen: "om_visible", body: "ราคานี้รวมค่าดำเนินการ O&M เป็นเวลา {{om_years}} ปี{{om_visits_phrase}} ตามรายการดังนี้" },
        ],
      },
      {
        key: "om",
        page: 2,
        showWhen: "om_visible",
        kind: "om_services",
        title: "การดำเนินงานและการบำรุงรักษาระยะเวลา {{om_years}} ปี (กรณีติดตั้งใหม่ทั้งระบบ)",
        lines: [
          { key: "om-cleaning", page: 2, showWhen: "om_cleaning", body: "ล้างแผงโซลาร์เซลล์ ปีละ {{service_visits}} ครั้ง เป็นระยะเวลา {{service_years}} ปี หรือประเมินจากความสกปรก" },
          { key: "om-thermoscan", page: 2, showWhen: "om_thermoscan", body: "ตรวจสอบระบบโซลาร์เซลล์ ตรวจสอบจุดเชื่อมต่อ พร้อมทำ THERMOSCAN ปีละ {{service_visits}} ครั้ง เป็นระยะเวลา {{service_years}} ปี" },
          { key: "om-visual", page: 2, showWhen: "om_visual", body: "ตรวจสอบความผิดปกติของแผงโซลาร์เซลล์ทางกายภาพ ปีละ {{service_visits}} ครั้ง เป็นระยะเวลา {{service_years}} ปี" },
        ],
      },
      { key: "extra", page: 2, title: "เงื่อนไขเพิ่มเติม", lines: EXTRA_LINES },
    ],
  });
}

/** จับคู่บรรทัดมาตรฐานด้วย key เพื่อรู้ว่าอันไหน locked และอันไหนถูกแก้ถ้อยคำแล้ว */
export function getStandardQuotationTermLines(
  profile: QuotationTermsProfile,
): Map<string, QuotationTermLine> {
  const map = new Map<string, QuotationTermLine>();
  for (const section of getStandardQuotationTermTree(profile).sections) {
    for (const line of section.lines) map.set(line.key, line);
  }
  return map;
}

const OM_SERVICE_BY_LINE_KEY: Record<string, keyof Pick<QuotationOmSettings, "cleaning" | "thermoscan" | "visual_inspection">> = {
  "om-cleaning": "cleaning",
  "om-thermoscan": "thermoscan",
  "om-visual": "visual_inspection",
};

function buildTermValues(validDays: unknown, om: QuotationOmSettings) {
  // สูตรเดิมเป๊ะ: ค่าว่าง/0/NaN → 7 · ค่าติดลบ → 1
  const validityDays = Math.max(1, Number(validDays) || 7);
  const services = om.enabled
    ? [om.cleaning, om.thermoscan, om.visual_inspection].filter((service) => service.enabled)
    : [];
  const omVisible = services.length > 0;
  // เงื่อนไขเดิมเป๊ะ: เติม "ปีละ N ครั้ง" ต่อท้ายเฉพาะตอนที่บริการที่เปิดอยู่
  // ใช้จำนวนปีเท่ากับ coverage_years ทุกตัว และมีความถี่เท่ากันทุกตัว
  const allServicesUseCoverage =
    services.length > 0 && services.every((service) => service.years === om.coverage_years);
  const frequencies = services.map((service) => service.visits_per_year);
  const sharedFrequency =
    frequencies.length > 0 && frequencies.every((frequency) => frequency === frequencies[0])
      ? frequencies[0]
      : null;
  return {
    om,
    omVisible,
    values: {
      valid_days: String(validityDays),
      om_years: String(om.coverage_years),
      om_visits_phrase:
        allServicesUseCoverage && sharedFrequency ? ` ปีละ ${sharedFrequency} ครั้ง` : "",
    } as Record<string, string>,
  };
}

function isVisible(
  showWhen: QuotationTermVisibility | undefined,
  ctx: ReturnType<typeof buildTermValues>,
): boolean {
  switch (showWhen) {
    case "om_visible":
      return ctx.omVisible;
    case "om_cleaning":
      return ctx.om.enabled && ctx.om.cleaning.enabled;
    case "om_thermoscan":
      return ctx.om.enabled && ctx.om.thermoscan.enabled;
    case "om_visual":
      return ctx.om.enabled && ctx.om.visual_inspection.enabled;
    default:
      return true;
  }
}

/** แทน {{key}} ด้วยค่าจริง — ตัวที่ไม่รู้จักถูกลบทิ้ง ไม่ปล่อยให้หลุดไปบนเอกสาร */
function fillPlaceholders(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_all, key: string) => values[key] ?? "");
}

/** ไล่เลขข้อ + แทนค่า + จัดหน้า ให้ออกมาเป็นรูปแบบที่ PDF route ใช้อยู่แล้ว */
export function renderQuotationTermTree(
  tree: QuotationTermTree,
  options: { validDays: unknown; om: QuotationOmSettings },
): QuotationLegalContent {
  const ctx = buildTermValues(options.validDays, options.om);
  const page1Sections: QuotationLegalSection[] = [];
  const page2LeadingParagraphs: string[] = [];
  const page2Sections: QuotationLegalSection[] = [];
  let sectionNumber = 0;

  for (const section of tree.sections) {
    if (!isVisible(section.showWhen, ctx)) continue;
    const visibleLines = section.lines.filter((line) => isVisible(line.showWhen, ctx));
    if (visibleLines.length === 0) continue;
    sectionNumber += 1;

    const rendered = visibleLines.map((line, index) => {
      const service = OM_SERVICE_BY_LINE_KEY[line.key];
      const values =
        section.kind === "om_services" && service
          ? {
              ...ctx.values,
              service_visits: String(ctx.om[service].visits_per_year),
              service_years: String(ctx.om[service].years),
            }
          : ctx.values;
      return {
        page: line.page,
        text: `${sectionNumber}.${index + 1}) ${fillPlaceholders(line.body, values)}`,
      };
    });

    const title = `${sectionNumber}. ${fillPlaceholders(section.title, ctx.values)}`;
    if (section.page === 1) {
      const onPage1 = rendered.filter((line) => line.page === 1).map((line) => line.text);
      if (onPage1.length) page1Sections.push({ title, paragraphs: onPage1 });
      page2LeadingParagraphs.push(
        ...rendered.filter((line) => line.page === 2).map((line) => line.text),
      );
    } else {
      page2Sections.push({ title, paragraphs: rendered.map((line) => line.text) });
    }
  }

  return { profile: tree.profile, page1Sections, page2LeadingParagraphs, page2Sections };
}

export const STANDARD_QUOTATION_PAYMENT_TERMS: ReadonlyArray<Readonly<QuotationPaymentTerm>> =
  Object.freeze([
    Object.freeze({
      label: "งวดที่ 1 ชำระ",
      percent: 20,
      due: "ภายใน 7 วัน นับจากวันที่ในใบเสนอราคา",
    }),
    Object.freeze({
      label: "งวดที่ 2 ชำระ",
      percent: 80,
      due: "ภายใน 3 วัน ก่อนวันติดตั้ง",
    }),
  ]);

export function getStandardQuotationPaymentTerms(): QuotationPaymentTerm[] {
  return STANDARD_QUOTATION_PAYMENT_TERMS.map((term) => ({ ...term }));
}

export function getStandardQuotationOmSettings(): QuotationOmSettings {
  const service = (): QuotationOmService => ({
    enabled: true,
    visits_per_year: 2,
    years: 2,
  });
  return {
    enabled: true,
    coverage_years: 2,
    cleaning: service(),
    thermoscan: service(),
    visual_inspection: service(),
  };
}

export function parseQuotationOmSettings(value: unknown): QuotationOmSettings {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      candidate = {};
    }
  }
  const row = candidate && typeof candidate === "object"
    ? candidate as Record<string, unknown>
    : {};
  const defaults = getStandardQuotationOmSettings();
  const integer = (raw: unknown, fallback: number, maximum: number) => {
    const parsed = Number(raw);
    return Number.isFinite(parsed)
      ? Math.min(maximum, Math.max(0, Math.round(parsed)))
      : fallback;
  };
  const coverageYears = integer(row.coverage_years, defaults.coverage_years, 4);
  const service = (key: keyof Pick<QuotationOmSettings, "cleaning" | "thermoscan" | "visual_inspection">) => {
    const raw = row[key] && typeof row[key] === "object"
      ? row[key] as Record<string, unknown>
      : {};
    const fallback = defaults[key];
    return {
      enabled: typeof raw.enabled === "boolean" ? raw.enabled : fallback.enabled,
      visits_per_year: integer(raw.visits_per_year, fallback.visits_per_year, 4),
      years: Math.min(
        coverageYears,
        integer(raw.years, Math.min(fallback.years, coverageYears), 4),
      ),
    };
  };
  return {
    enabled: typeof row.enabled === "boolean" ? row.enabled : defaults.enabled,
    coverage_years: coverageYears,
    cleaning: service("cleaning"),
    thermoscan: service("thermoscan"),
    visual_inspection: service("visual_inspection"),
  };
}

export function isStandardQuotationOmSettings(value: unknown): boolean {
  return JSON.stringify(parseQuotationOmSettings(value)) ===
    JSON.stringify(getStandardQuotationOmSettings());
}

export function parseQuotationPaymentTerms(
  value: unknown,
): QuotationPaymentTerm[] {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return getStandardQuotationPaymentTerms();
    }
  }
  if (!Array.isArray(candidate)) return getStandardQuotationPaymentTerms();

  const terms = candidate
    .map((term, index) => {
      if (!term || typeof term !== "object") return null;
      const row = term as Record<string, unknown>;
      const percent = Number(row.percent);
      return {
        label:
          String(row.label || "").trim().slice(0, 200) ||
          `งวดที่ ${index + 1} ชำระ`,
        percent: Number.isFinite(percent)
          ? Math.min(100, Math.max(0, percent))
          : 0,
        due: String(row.due || "").trim().slice(0, 500),
      };
    })
    .filter((term): term is QuotationPaymentTerm => term !== null);

  return terms.length ? terms : getStandardQuotationPaymentTerms();
}

export function getQuotationPaymentTermsTotal(
  terms: QuotationPaymentTerm[],
): number {
  return Math.round(
    terms.reduce(
      (total, term) =>
        total + (Number.isFinite(term.percent) ? term.percent : 0),
      0,
    ) * 100,
  ) / 100;
}

export function balanceFinalQuotationPaymentTerm(
  terms: QuotationPaymentTerm[],
): QuotationPaymentTerm[] {
  if (!terms.length) return terms;
  let allocatedPercent = 0;
  return terms.map((term, index) => {
    if (index === terms.length - 1) {
      return {
        ...term,
        percent:
          Math.round(Math.max(0, 100 - allocatedPercent) * 100_000_000) /
          100_000_000,
      };
    }
    if (!Number.isFinite(term.percent)) return term;
    const percent = Math.min(
      Math.max(0, 100 - allocatedPercent),
      Math.max(0, term.percent),
    );
    allocatedPercent += percent;
    return { ...term, percent };
  });
}

const asBoolean = (value: unknown) =>
  value === true || value === 1 || value === "1" || value === "true";

export function getQuotationTermsProfile(
  pkg: Record<string, unknown> | null | undefined,
): QuotationTermsProfile {
  if (!pkg) return "full_install";

  const name = String(pkg.name || "").trim();
  if (asBoolean(pkg.is_upgrade) || /^scale\s*up\s*:/i.test(name)) {
    return "additional_install";
  }

  const hasEquipmentFlags =
    pkg.has_panel !== undefined &&
    pkg.has_inverter !== undefined &&
    pkg.has_battery !== undefined;
  const isBatteryOnly =
    hasEquipmentFlags &&
    asBoolean(pkg.has_battery) &&
    !asBoolean(pkg.has_panel) &&
    !asBoolean(pkg.has_inverter);

  return isBatteryOnly ? "additional_install" : "full_install";
}

const ADDITIONAL_TERMS_LINE_KEY = "x-additional";

/** ต่อ terms_text เดิมของใบเป็นบรรทัดสุดท้ายของ "เงื่อนไขเพิ่มเติม" (พฤติกรรมเดิม) */
function withAdditionalTerms(
  tree: QuotationTermTree,
  additionalTerms: string,
): QuotationTermTree {
  const text = additionalTerms.trim();
  if (!text) return tree;
  const target =
    tree.sections.find((section) => section.key === "extra") ??
    tree.sections[tree.sections.length - 1];
  if (!target) return tree;
  target.lines.push({
    key: ADDITIONAL_TERMS_LINE_KEY,
    body: text,
    page: 2,
    origin: "custom",
  });
  return tree;
}

const TERM_VISIBILITIES: readonly QuotationTermVisibility[] = [
  "always",
  "om_visible",
  "om_cleaning",
  "om_thermoscan",
  "om_visual",
];

/**
 * อ่านชุดเงื่อนไขที่ผู้ใช้แก้ไว้ในใบ (document_inputs_json.terms)
 * คืน null ถ้าไม่มีหรือพังจนใช้ไม่ได้ → ผู้เรียกจะ fallback ไปชุดมาตรฐานในโค้ด
 *
 * บังคับกติกาฝั่ง server ตรงนี้ด้วย ไม่ใช่แค่ซ่อนปุ่มใน UI:
 *   - บรรทัดที่ locked แก้ถ้อยคำไม่ได้ (ดึงข้อความมาตรฐานกลับมาทับ)
 *   - บรรทัดที่ locked ลบไม่ได้ (ถ้าหายไปจะถูกใส่กลับที่ตำแหน่งเดิม)
 *   - เงื่อนไขการซ่อน/แสดงของบรรทัดมาตรฐานยึดตามโค้ดเสมอ แก้จากใบไม่ได้
 */
export function parseQuotationTermTree(
  value: unknown,
  profile: QuotationTermsProfile,
): QuotationTermTree | null {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  if (!candidate || typeof candidate !== "object") return null;
  const row = candidate as Record<string, unknown>;
  if (!Array.isArray(row.sections)) return null;

  const standard = getStandardQuotationTermTree(profile);
  const standardLines = getStandardQuotationTermLines(profile);
  const pageOf = (raw: unknown, fallback: 1 | 2): 1 | 2 =>
    Number(raw) === 1 ? 1 : Number(raw) === 2 ? 2 : fallback;
  const visibilityOf = (raw: unknown): QuotationTermVisibility | undefined => {
    const text = String(raw ?? "");
    return text !== "always" && TERM_VISIBILITIES.includes(text as QuotationTermVisibility)
      ? (text as QuotationTermVisibility)
      : undefined;
  };

  const seenLineKeys = new Set<string>();
  const sections: QuotationTermSection[] = [];
  for (const rawSection of row.sections) {
    if (!rawSection || typeof rawSection !== "object") continue;
    const source = rawSection as Record<string, unknown>;
    const title = String(source.title ?? "").trim().slice(0, 300);
    if (!title) continue;
    const sectionKey =
      String(source.key ?? "").trim().slice(0, 60) || `s-${sections.length + 1}`;
    const lines: QuotationTermLine[] = [];
    for (const rawLine of Array.isArray(source.lines) ? source.lines : []) {
      if (!rawLine || typeof rawLine !== "object") continue;
      const line = rawLine as Record<string, unknown>;
      const key = String(line.key ?? "").trim().slice(0, 60);
      const std = key ? standardLines.get(key) : undefined;
      if (key && seenLineKeys.has(key)) continue;
      const body = std?.locked ? std.body : String(line.body ?? "").trim().slice(0, 1000);
      if (!body) continue;
      if (key) seenLineKeys.add(key);
      lines.push({
        key: key || `${sectionKey}-${lines.length + 1}`,
        body,
        page: pageOf(line.page, std?.page ?? 2),
        showWhen: std ? std.showWhen : visibilityOf(line.showWhen),
        ...(std?.locked ? { locked: true as const } : {}),
        origin: std ? "standard" : "custom",
      });
    }
    sections.push({
      key: sectionKey,
      title,
      page: pageOf(source.page, 2),
      showWhen: visibilityOf(source.showWhen),
      kind: source.kind === "om_services" ? "om_services" : "normal",
      lines,
    });
  }
  if (sections.length === 0) return null;

  // ข้อที่ล็อกไว้ถูกลบออกไป → ใส่กลับที่ตำแหน่งเดิมของชุดมาตรฐาน
  for (const stdSection of standard.sections) {
    for (const [index, stdLine] of stdSection.lines.entries()) {
      if (!stdLine.locked || seenLineKeys.has(stdLine.key)) continue;
      const restored: QuotationTermLine = { ...stdLine, origin: "standard" };
      const target = sections.find((section) => section.key === stdSection.key);
      if (target) target.lines.splice(Math.min(index, target.lines.length), 0, restored);
      else sections.push({ ...stdSection, lines: [restored] });
      seenLineKeys.add(stdLine.key);
    }
  }

  // เก็บเฉพาะข้อมาตรฐานที่ถูกลบจริง ๆ ไว้ให้กด "คืนข้อที่ลบ"
  const removed: QuotationTermLine[] = [];
  for (const rawLine of Array.isArray(row.removed) ? row.removed : []) {
    if (!rawLine || typeof rawLine !== "object") continue;
    const key = String((rawLine as Record<string, unknown>).key ?? "").trim();
    const std = standardLines.get(key);
    if (std && !std.locked && !seenLineKeys.has(key)) {
      seenLineKeys.add(key);
      removed.push({ ...std, origin: "standard" });
    }
  }

  return { profile, sections, ...(removed.length ? { removed } : {}) };
}

export function getQuotationLegalContent(
  pkg: Record<string, unknown> | null | undefined,
  validDays: unknown,
  additionalTerms = "",
  omValue?: unknown,
  terms?: unknown,
): QuotationLegalContent {
  const profile = getQuotationTermsProfile(pkg);
  const om = parseQuotationOmSettings(omValue);
  // ใบที่ผู้ใช้แก้เงื่อนไขไว้ใช้ชุดของใบเอง — terms_text เดิมถูกย้ายเข้าไปเป็น
  // บรรทัดหนึ่งในชุดนั้นแล้วตั้งแต่ตอนเปิดแท็บ จึงไม่ต่อท้ายซ้ำอีก
  const stored = parseQuotationTermTree(terms, profile);
  const tree =
    stored ?? withAdditionalTerms(getStandardQuotationTermTree(profile), additionalTerms);
  return renderQuotationTermTree(tree, { validDays, om });
}

/** ชุดตั้งต้นตอนเปิดแท็บ "เงื่อนไข/ข้อกำหนด" ของใบที่ยังไม่เคยแก้ */
export function seedQuotationTermTree(
  profile: QuotationTermsProfile,
  additionalTerms = "",
): QuotationTermTree {
  return withAdditionalTerms(getStandardQuotationTermTree(profile), additionalTerms);
}

/** true เมื่อชุดของใบยังเท่ากับชุดมาตรฐานเป๊ะ — ใช้ตัดสินว่าจะบันทึก terms ลงใบไหม */
export function isStandardQuotationTermTree(
  tree: QuotationTermTree,
  additionalTerms = "",
): boolean {
  return (
    JSON.stringify(tree) ===
    JSON.stringify(seedQuotationTermTree(tree.profile, additionalTerms))
  );
}

/** นับส่วนต่างจากชุดมาตรฐาน — ใช้โชว์ "ต่างจากมาตรฐาน N จุด" ในหน้าจอ */
export function getQuotationTermTreeDiff(tree: QuotationTermTree) {
  const standardLines = getStandardQuotationTermLines(tree.profile);
  let edited = 0;
  let added = 0;
  const present = new Set<string>();
  for (const section of tree.sections) {
    for (const line of section.lines) {
      const std = standardLines.get(line.key);
      if (!std) {
        added += 1;
        continue;
      }
      present.add(line.key);
      if (std.body !== line.body) edited += 1;
    }
  }
  let removed = 0;
  for (const [key, line] of standardLines) {
    if (!line.locked && !present.has(key)) removed += 1;
  }
  return { edited, added, removed, total: edited + added + removed };
}
