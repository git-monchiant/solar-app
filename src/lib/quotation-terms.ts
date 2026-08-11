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

export function getQuotationLegalContent(
  pkg: Record<string, unknown> | null | undefined,
  validDays: unknown,
  additionalTerms = "",
  omValue?: unknown,
): QuotationLegalContent {
  const profile = getQuotationTermsProfile(pkg);
  const validityDays = Math.max(1, Number(validDays) || 7);
  const warranty: QuotationLegalSection = {
    title: "1. รายละเอียดการรับประกันสินค้า",
    paragraphs: [
      "1.1) การรับประกัน แผงโซลาร์เซลล์ PRODUCTION WARRANTY และ รับประกัน PERFORMANCE WARRANTY โดยจะรับประกันจากผู้ผลิต",
      "1.2) การรับประกัน INVERTER รับประกันมาตรฐาน โดยรับประกันจากผู้ผลิต",
      "1.3) การรับประกัน BATTERY รับประกันมาตรฐาน โดยรับประกันจากผู้ผลิต",
      `1.4) ยืนยันราคาภายใน ${validityDays} วัน นับจากวันที่ออกเอกสารใบเสนอราคา`,
    ],
  };
  const sharedInstallationConditions = [
    "2.1) ราคาดังกล่าวรวมค่าใช้จ่ายในการขอใบอนุญาต ได้แก่ ใบอนุญาตขนานไฟ เอกสารนอกเหนือจากนี้จะมีค่าใช้จ่ายเพิ่มเติม",
    "2.2) ราคานี้ไม่รวมงานปรับปรุงระบบและสายไฟฟ้าเพิ่มเติมภายในบ้าน ทางบริษัทฯ ยินดีเสนอราคาเพิ่มเติมตามความเหมาะสมของหน้างาน",
    "2.3) หากมีการเปลี่ยนแปลงจากที่ตกลง บริษัทฯ ขอสงวนสิทธิ์คิดค่าใช้จ่ายเป็นงานเพิ่ม",
    "2.4) บ้านที่จะติดตั้งระบบโซลาร์เซลล์ ต้องยื่นขออนุญาตเรียบร้อยแล้ว พร้อมมีบ้านเลขที่และติดตั้งมิเตอร์จากการไฟฟ้าเป็นมิเตอร์ไฟจริงแล้ว",
  ];

  if (profile === "additional_install") {
    const additionalConditions = [
      "3.1) ใบเสนอราคานี้เป็นเพียงการประมาณการเบื้องต้น หากติดตั้งจริงอาจมีการเปลี่ยนแปลงราคาในภายหลัง",
      "3.2) ผู้ขายขอสงวนสิทธิ์ในการเลือกใช้อุปกรณ์ในการติดตั้งระบบโซลาร์เซลล์",
      "3.3) เงินค่าจองเพื่อซื้อระบบโซลาร์เซลล์ จะถูกคืนให้ลูกค้าโดยหักจากยอดเงินที่ลูกค้าโอนชำระเมื่อตกลงซื้อระบบโซลาร์เซลล์",
    ];
    if (additionalTerms.trim()) {
      additionalConditions.push(`3.4) ${additionalTerms.trim()}`);
    }
    return {
      profile,
      page1Sections: [
        warranty,
        {
          title: "2. เงื่อนไขรับประกันงานติดตั้ง (กรณีเฉพาะติดตั้งเพิ่ม)",
          paragraphs: sharedInstallationConditions,
        },
      ],
      page2LeadingParagraphs: [
        "2.5) รับประกันงานติดตั้งเฉพาะอุปกรณ์ที่ติดตั้งเพิ่มเท่านั้น",
      ],
      page2Sections: [
        { title: "3. เงื่อนไขเพิ่มเติม", paragraphs: additionalConditions },
      ],
    };
  }

  const om = parseQuotationOmSettings(omValue);
  const activeOmServices = om.enabled
    ? [
        om.cleaning.enabled
          ? `ล้างแผงโซลาร์ ${om.cleaning.visits_per_year} ครั้งต่อปี เป็นระยะเวลา ${om.cleaning.years} ปี หรือประเมินจากความสกปรก`
          : null,
        om.thermoscan.enabled
          ? `ตรวจสอบระบบโซลาร์เซลล์ ตรวจสอบจุดเชื่อมต่อ พร้อมทำ THERMOSCAN ปีละ ${om.thermoscan.visits_per_year} ครั้ง เป็นระยะเวลา ${om.thermoscan.years} ปี`
          : null,
        om.visual_inspection.enabled
          ? `ตรวจสอบความผิดปกติของแผงโซลาร์เซลล์ทางกายภาพ ปีละ ${om.visual_inspection.visits_per_year} ครั้ง เป็นระยะเวลา ${om.visual_inspection.years} ปี`
          : null,
      ].filter((paragraph): paragraph is string => paragraph !== null)
    : [];
  const hasOm = activeOmServices.length > 0;
  const conditionsSectionNumber = hasOm ? 4 : 3;
  const fullInstallConditions = [
    "ใบเสนอราคานี้เป็นเพียงการประมาณการเบื้องต้น หากติดตั้งจริงอาจมีการเปลี่ยนแปลงราคาในภายหลัง",
    "ผู้ขายขอสงวนสิทธิ์ในการเลือกใช้อุปกรณ์ในการติดตั้งระบบโซลาร์เซลล์",
    "เงินค่าจองเพื่อซื้อระบบโซลาร์เซลล์ จะถูกคืนให้ลูกค้าโดยหักจากยอดเงินที่ลูกค้าโอนชำระเมื่อตกลงซื้อระบบโซลาร์เซลล์",
  ].map((paragraph, index) => `${conditionsSectionNumber}.${index + 1}) ${paragraph}`);
  if (additionalTerms.trim()) {
    fullInstallConditions.push(
      `${conditionsSectionNumber}.${fullInstallConditions.length + 1}) ${additionalTerms.trim()}`,
    );
  }
  const allServicesUseCoverage = activeOmServices.length > 0 &&
    [om.cleaning, om.thermoscan, om.visual_inspection]
      .filter((service) => service.enabled)
      .every((service) => service.years === om.coverage_years);
  const activeFrequencies = [om.cleaning, om.thermoscan, om.visual_inspection]
    .filter((service) => service.enabled)
    .map((service) => service.visits_per_year);
  const sharedFrequency = activeFrequencies.length > 0 &&
    activeFrequencies.every((frequency) => frequency === activeFrequencies[0])
      ? activeFrequencies[0]
      : null;
  const omSummary = hasOm
    ? `2.6) ราคานี้รวมค่าดำเนินการ O&M เป็นเวลา ${om.coverage_years} ปี${allServicesUseCoverage && sharedFrequency ? ` ปีละ ${sharedFrequency} ครั้ง` : ""} ตามรายการดังนี้`
    : null;
  return {
    profile,
    page1Sections: [
      warranty,
      {
        title: "2. หมายเหตุ (กรณีติดตั้งใหม่ทั้งระบบ)",
        paragraphs: sharedInstallationConditions,
      },
    ],
    page2LeadingParagraphs: [
      "2.5) รับประกันงานติดตั้งระบบโซลาร์เซลล์ เป็นระยะเวลา 2 ปี",
      ...(omSummary ? [omSummary] : []),
    ],
    page2Sections: [
      ...(hasOm
        ? [{
            title: `3. การดำเนินงานและการบำรุงรักษาระยะเวลา ${om.coverage_years} ปี (กรณีติดตั้งใหม่ทั้งระบบ)`,
            paragraphs: activeOmServices.map(
              (paragraph, index) => `3.${index + 1}) ${paragraph}`,
            ),
          }]
        : []),
      {
        title: `${conditionsSectionNumber}. เงื่อนไขเพิ่มเติม`,
        paragraphs: fullInstallConditions,
      },
    ],
  };
}
