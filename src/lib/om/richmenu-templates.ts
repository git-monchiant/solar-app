import "server-only";

// ═══ เทมเพลตผัง Rich Menu ═══
// ยกจากโปรเจกต์ sena-ev (~/Documents/Line OA Project/Docs/ExampleProject/sena-ev/src/app/admin/richmenu/_lib.ts)
// พิกัดผ่านการใช้งานจริงกับ LINE มาแล้ว — ไม่คำนวณใหม่เพื่อไม่ให้ปัดเศษเพี้ยน (833/834/833 = 2500 พอดี)

export type TemplateGroup = "large" | "small";
export type RichMenuBounds = { x: number; y: number; width: number; height: number };
export type RichMenuTemplate = {
  id: string;
  group: TemplateGroup;
  name: string;
  size: { width: number; height: number };
  areas: RichMenuBounds[];
};

export const RICH_MENU_TEMPLATES: RichMenuTemplate[] = [
  {
    id: "large-6",
    group: "large",
    name: "ใหญ่ 6 ช่อง",
    size: { width: 2500, height: 1686 },
    areas: [
      { x: 0, y: 0, width: 833, height: 843 },
      { x: 833, y: 0, width: 834, height: 843 },
      { x: 1667, y: 0, width: 833, height: 843 },
      { x: 0, y: 843, width: 833, height: 843 },
      { x: 833, y: 843, width: 834, height: 843 },
      { x: 1667, y: 843, width: 833, height: 843 },
    ],
  },
  {
    id: "large-4",
    group: "large",
    name: "ใหญ่ 4 ช่อง",
    size: { width: 2500, height: 1686 },
    areas: [
      { x: 0, y: 0, width: 1250, height: 843 },
      { x: 1250, y: 0, width: 1250, height: 843 },
      { x: 0, y: 843, width: 1250, height: 843 },
      { x: 1250, y: 843, width: 1250, height: 843 },
    ],
  },
  {
    id: "large-1-3",
    group: "large",
    name: "ใหญ่ บน 1 ล่าง 3",
    size: { width: 2500, height: 1686 },
    areas: [
      { x: 0, y: 0, width: 2500, height: 843 },
      { x: 0, y: 843, width: 833, height: 843 },
      { x: 833, y: 843, width: 834, height: 843 },
      { x: 1667, y: 843, width: 833, height: 843 },
    ],
  },
  {
    id: "large-left-2",
    group: "large",
    name: "ใหญ่ ซ้ายใหญ่ ขวา 2",
    size: { width: 2500, height: 1686 },
    areas: [
      { x: 0, y: 0, width: 1667, height: 1686 },
      { x: 1667, y: 0, width: 833, height: 843 },
      { x: 1667, y: 843, width: 833, height: 843 },
    ],
  },
  {
    id: "large-2-row",
    group: "large",
    name: "ใหญ่ 2 แถว",
    size: { width: 2500, height: 1686 },
    areas: [
      { x: 0, y: 0, width: 2500, height: 843 },
      { x: 0, y: 843, width: 2500, height: 843 },
    ],
  },
  {
    id: "large-2-col",
    group: "large",
    name: "ใหญ่ 2 คอลัมน์",
    size: { width: 2500, height: 1686 },
    areas: [
      { x: 0, y: 0, width: 1250, height: 1686 },
      { x: 1250, y: 0, width: 1250, height: 1686 },
    ],
  },
  {
    id: "large-1",
    group: "large",
    name: "ใหญ่ 1 ช่อง",
    size: { width: 2500, height: 1686 },
    areas: [{ x: 0, y: 0, width: 2500, height: 1686 }],
  },
  {
    id: "small-4",
    group: "small",
    name: "เล็ก 4 ช่อง",
    size: { width: 2500, height: 843 },
    areas: [
      { x: 0, y: 0, width: 625, height: 843 },
      { x: 625, y: 0, width: 625, height: 843 },
      { x: 1250, y: 0, width: 625, height: 843 },
      { x: 1875, y: 0, width: 625, height: 843 },
    ],
  },
  {
    id: "small-3",
    group: "small",
    name: "เล็ก 3 ช่อง",
    size: { width: 2500, height: 843 },
    areas: [
      { x: 0, y: 0, width: 833, height: 843 },
      { x: 833, y: 0, width: 834, height: 843 },
      { x: 1667, y: 0, width: 833, height: 843 },
    ],
  },
  {
    id: "small-2",
    group: "small",
    name: "เล็ก 2 ช่อง",
    size: { width: 2500, height: 843 },
    areas: [
      { x: 0, y: 0, width: 1250, height: 843 },
      { x: 1250, y: 0, width: 1250, height: 843 },
    ],
  },
  {
    id: "small-left",
    group: "small",
    name: "เล็ก ซ้ายใหญ่ ขวาเล็ก",
    size: { width: 2500, height: 843 },
    areas: [
      { x: 0, y: 0, width: 1667, height: 843 },
      { x: 1667, y: 0, width: 833, height: 843 },
    ],
  },
  {
    id: "small-1",
    group: "small",
    name: "เล็ก 1 ช่อง",
    size: { width: 2500, height: 843 },
    areas: [{ x: 0, y: 0, width: 2500, height: 843 }],
  },
];

export const DEFAULT_TEMPLATE_ID = "large-6";

export function areaLabel(index: number): string {
  return String.fromCharCode(65 + index);
}

export function getTemplateById(id: string): RichMenuTemplate {
  return RICH_MENU_TEMPLATES.find((t) => t.id === id) ?? RICH_MENU_TEMPLATES[0];
}

/** เดาว่า layout ที่บันทึกไว้ตรงกับเทมเพลตไหน (ใช้ตอนเปิดเวอร์ชันเดิมมาแก้) */
export function findTemplateIdForLayout(
  layout: { size: { width: number; height: number }; areas: { bounds: RichMenuBounds }[] },
): string {
  const found = RICH_MENU_TEMPLATES.find((t) =>
    t.size.width === layout.size.width &&
    t.size.height === layout.size.height &&
    t.areas.length === layout.areas.length &&
    t.areas.every((a, i) => {
      const b = layout.areas[i]?.bounds;
      return b?.x === a.x && b?.y === a.y && b?.width === a.width && b?.height === a.height;
    }),
  );
  return found?.id ?? DEFAULT_TEMPLATE_ID;
}
