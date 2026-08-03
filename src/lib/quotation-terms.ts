export type QuotationTermsProfile = "full_install" | "additional_install";

export type QuotationPaymentTerm = {
  label: string;
  percent: number;
  due: string;
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

  const fullInstallConditions = [
    "4.1) ใบเสนอราคานี้เป็นเพียงการประมาณการเบื้องต้น หากติดตั้งจริงอาจมีการเปลี่ยนแปลงราคาในภายหลัง",
    "4.2) ผู้ขายขอสงวนสิทธิ์ในการเลือกใช้อุปกรณ์ในการติดตั้งระบบโซลาร์เซลล์",
    "4.3) เงินค่าจองเพื่อซื้อระบบโซลาร์เซลล์ จะถูกคืนให้ลูกค้าโดยหักจากยอดเงินที่ลูกค้าโอนชำระเมื่อตกลงซื้อระบบโซลาร์เซลล์",
  ];
  if (additionalTerms.trim()) {
    fullInstallConditions.push(`4.4) ${additionalTerms.trim()}`);
  }
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
      "2.6) ราคานี้รวมค่าดำเนินการ O&M เป็นเวลา 2 ปี ปีละ 2 ครั้ง ตามรายการดังนี้",
    ],
    page2Sections: [
      {
        title:
          "3. การดำเนินงานและการบำรุงรักษาระยะเวลา 2 ปี (กรณีติดตั้งใหม่ทั้งระบบ)",
        paragraphs: [
          "3.1) ล้างแผงโซลาร์ 2 ครั้งต่อปี เป็นระยะเวลา 2 ปี หรือประเมินจากความสกปรก",
          "3.2) ตรวจสอบระบบโซลาร์เซลล์ ตรวจสอบจุดเชื่อมต่อ พร้อมทำ THERMOSCAN ปีละ 2 ครั้ง เป็นระยะเวลา 2 ปี",
          "3.3) ตรวจสอบความผิดปกติของแผงโซลาร์เซลล์ทางกายภาพ ปีละ 2 ครั้ง เป็นระยะเวลา 2 ปี",
        ],
      },
      { title: "4. เงื่อนไขเพิ่มเติม", paragraphs: fullInstallConditions },
    ],
  };
}
