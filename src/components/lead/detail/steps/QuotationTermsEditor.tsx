"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fillQuotationTermText,
  getQuotationTermNumbering,
  isQuotationTermVisible,
  getStandardQuotationTermLines,
  seedQuotationTermTree,
  type QuotationOmSettings,
  type QuotationTermLine,
  type QuotationTermSection,
  type QuotationTermTree,
  type QuotationTermsProfile,
} from "@/lib/quotation-terms";

const PROFILE_LABEL: Record<QuotationTermsProfile, string> = {
  full_install: "ติดตั้งใหม่ทั้งระบบ",
  additional_install: "ติดตั้งเพิ่ม",
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const newKey = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * ช่องพิมพ์ข้อความเงื่อนไข — ยืดความสูงตามข้อความเหมือนช่องชื่อหัวข้อในแท็บรายการ
 * พิมพ์อะไรก็ได้ ไม่มีป้ายพิเศษ ไม่มีอะไรพิมพ์ทับไม่ได้
 */
function TermBodyInput({
  value,
  bold,
  placeholder,
  onChange,
}: {
  value: string;
  bold?: boolean;
  placeholder?: string;
  onChange: (next: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  // ต้องวัดใหม่เมื่อค่าถูกเปลี่ยนจากข้างนอกด้วย (กดคืนค่า / สลับ O&M)
  // ไม่งั้นข้อความยาวขึ้นแล้วช่องยังเตี้ยเท่าเดิมจนโดนตัด
  useEffect(() => {
    if (ref.current) fit(ref.current);
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => {
        fit(e.target);
        onChange(e.target.value);
      }}
      placeholder={placeholder}
      className={`w-full min-w-0 resize-none overflow-hidden rounded-md border border-transparent bg-transparent px-1.5 py-1 leading-snug outline-none transition-colors placeholder:font-normal placeholder:text-gray-300 hover:border-gray-200 focus:border-primary focus:bg-white ${
        bold ? "text-sm font-semibold text-gray-800" : "text-xs text-gray-700"
      }`}
    />
  );
}

export default function QuotationTermsEditor({
  value,
  profile,
  legacyTermsText,
  om,
  validDays,
  onChange,
}: {
  value: QuotationTermTree | null;
  profile: QuotationTermsProfile;
  legacyTermsText: string;
  om: QuotationOmSettings;
  validDays: number;
  onChange: (next: QuotationTermTree | null) => void;
}) {
  const tree = useMemo(
    () => value ?? seedQuotationTermTree(profile, legacyTermsText),
    [value, profile, legacyTermsText],
  );
  const standardLines = useMemo(() => getStandardQuotationTermLines(tree.profile), [tree.profile]);

  // เลขข้อ — ใช้ตัวเดียวกับที่ PDF ไล่ จะได้ตรงกันเสมอ
  const numbering = useMemo(
    () => getQuotationTermNumbering(tree, { validDays, om }),
    [tree, validDays, om],
  );

  /** ฝังตัวเลข O&M ลงในข้อความ แล้วเลิกผูกการซ่อน/แสดงกับค่า O&M */
  const materializeLine = useCallback(
    (line: QuotationTermLine, sectionKind: QuotationTermSection["kind"]) => {
      const next: QuotationTermLine = {
        ...line,
        // เก็บ {{valid_days}} ไว้ตัวเดียว เพราะจำนวนวันยืนราคายังมีช่องกรอกอยู่
        // ตัวเลขจะได้วิ่งตามต่อไป ส่วนค่า O&M ไม่มีที่ให้ตั้งแล้ว จึงฝังเป็นข้อความ
        body: fillQuotationTermText(line.body, {
          validDays,
          om,
          lineKey: line.key,
          sectionKind,
          keep: ["valid_days"],
        }),
      };
      delete next.showWhen;
      return next;
    },
    [validDays, om],
  );

  /**
   * ครั้งแรกที่ผู้ใช้แก้อะไรสักอย่าง — แปลงต้นไม้เป็น "ข้อความล้วน" ที่คุมได้จาก
   * หน้านี้ที่เดียว บรรทัดที่ค่า O&M ซ่อนอยู่ตอนนี้ (ไม่ได้ขึ้นบนเอกสารอยู่แล้ว)
   * ถูกตัดทิ้งไปเลย เอกสารจึงออกมาเหมือนเดิมทุกตัวอักษร
   * ถ้าอยากได้กลับมา ใช้ "คืนค่าจาก Master หัวข้อนี้"
   */
  const materialize = useCallback(
    (source: QuotationTermTree): QuotationTermTree => {
      const draft = clone(source);
      delete draft.removed;
      for (const section of draft.sections) {
        const sectionHidden = !isQuotationTermVisible(section.showWhen, om);
        section.lines = section.lines
          .filter((line) => !sectionHidden && isQuotationTermVisible(line.showWhen, om))
          .map((line) => materializeLine(line, section.kind));
        section.title = fillQuotationTermText(section.title, {
          validDays,
          om,
          keep: ["valid_days"],
        });
        delete section.showWhen;
      }
      return draft;
    },
    [om, validDays, materializeLine],
  );

  const update = useCallback(
    (mutate: (draft: QuotationTermTree) => void) => {
      // value === null แปลว่ายังไม่เคยแก้ ต้องแปลงก่อนหนึ่งครั้ง
      const draft = value ? clone(tree) : materialize(tree);
      mutate(draft);
      onChange(draft);
    },
    [tree, value, materialize, onChange],
  );

  const moveSection = (index: number, delta: number) =>
    update((draft) => {
      const target = index + delta;
      if (target < 0 || target >= draft.sections.length) return;
      const [item] = draft.sections.splice(index, 1);
      draft.sections.splice(target, 0, item);
    });

  const moveLine = (sectionIndex: number, lineIndex: number, delta: number) =>
    update((draft) => {
      const lines = draft.sections[sectionIndex].lines;
      const target = lineIndex + delta;
      if (target < 0 || target >= lines.length) return;
      const [item] = lines.splice(lineIndex, 1);
      lines.splice(target, 0, item);
    });

  // ลบแล้วคือลบเลย ไม่เก็บไว้ให้กดคืนทีละข้อ
  // ถ้าอยากได้ข้อมาตรฐานกลับมาทั้งชุด ใช้ "คืนค่าจาก Master หัวข้อนี้" ท้ายหัวข้อ
  const removeLine = (sectionIndex: number, lineIndex: number) =>
    update((draft) => {
      draft.sections[sectionIndex].lines.splice(lineIndex, 1);
    });

  const addLine = (sectionIndex: number) =>
    update((draft) => {
      const section = draft.sections[sectionIndex];
      const last = section.lines[section.lines.length - 1];
      section.lines.push({
        key: newKey("c"),
        body: "",
        page: last?.page ?? (section.page === 1 ? 1 : 2),
        origin: "custom",
      });
    });

  // หัวข้อใหม่ไม่ผูกกับหน้า 2 อีก — ตั้งเป็นหน้า 1 แล้วปล่อยให้ "ตำแหน่งในรายการ"
  // เป็นตัวตัดสิน (ดู orderSectionsForDocument) วางไว้ท้ายสุดก็ยังไปอยู่หน้า 2 ตามเดิม
  // แต่ถ้าเลื่อนขึ้นไปอยู่เหนือหัวข้อของหน้า 2 มันจะขึ้นหน้า 1 ให้เอง
  const addSection = () =>
    update((draft) => {
      draft.sections.push({
        key: newKey("s"),
        title: "",
        page: 1,
        kind: "normal",
        lines: [{ key: newKey("c"), body: "", page: 1, origin: "custom" }],
      });
    });

  /** ข้อความที่เอาไปโชว์ในช่องพิมพ์ = ข้อความสุดท้ายจริง ๆ (แทนค่าแล้ว) */
  const textOf = useCallback(
    (raw: string, lineKey?: string, sectionKind?: QuotationTermSection["kind"]) =>
      fillQuotationTermText(raw, { validDays, om, lineKey, sectionKind }),
    [validDays, om],
  );

  /**
   * เก็บสิ่งที่ผู้ใช้พิมพ์ — ถ้าพิมพ์ออกมาเท่ากับข้อความที่แทนค่าแล้วของเดิม
   * แปลว่ายังไม่ได้แก้จริง ให้คงรูปที่มี {{...}} ไว้ ตัวเลขจะได้วิ่งตาม
   * จำนวนวันยืนราคา/ค่า O&M ต่อไป · พอแก้จริงเมื่อไหร่ค่อยกลายเป็นข้อความตายตัว
   */
  const commitText = (
    raw: string,
    typed: string,
    lineKey?: string,
    sectionKind?: QuotationTermSection["kind"],
  ) => (typed === textOf(raw, lineKey, sectionKind) ? raw : typed);

  const profileMismatch = tree.profile !== profile;

  // หัวข้อที่หุบอยู่ — ค่าเริ่มต้นกางหมด เพื่อไม่ให้ของที่แก้ไว้หายไปจากสายตา
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleSection = (key: string) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  // ชุดมาตรฐานของโปรไฟล์นี้ — ใช้ทั้งหาว่าบรรทัดที่ถูกลบเคยอยู่หัวข้อไหน
  // และใช้คืนค่าเฉพาะหัวข้อ
  const standardTree = useMemo(() => seedQuotationTermTree(tree.profile), [tree.profile]);

  /** คืนค่าเฉพาะหัวข้อนี้ — เอาชื่อและบรรทัดมาตรฐานกลับมาให้ครบตามลำดับเดิม
      แต่ "ไม่ลบ" บรรทัดที่ผู้ใช้เพิ่มเองทิ้ง (ต่อท้ายไว้) เพราะการกดคืนค่า
      ไม่ควรทำลายของที่พิมพ์เองโดยไม่บอก */
  const restoreSection = (sectionIndex: number) =>
    update((draft) => {
      const section = draft.sections[sectionIndex];
      const master = standardTree.sections.find((candidate) => candidate.key === section.key);
      if (!master) return;
      const custom = section.lines.filter((line) => !standardLines.has(line.key));
      section.title = fillQuotationTermText(master.title, { validDays, om, keep: ["valid_days"] });
      section.lines = [...master.lines.map((line) => materializeLine(line, master.kind)), ...custom];
    });


  // ปุ่มบนหัวและปุ่มลิงก์ท้ายหัวข้อ — ใช้ชุดเดียวกับแท็บรายการในใบเสนอราคา
  const HEAD_BTN =
    "h-9 shrink-0 rounded-lg border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-700 transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary disabled:opacity-50";
  const ARROW =
    "flex h-6 w-5 items-center justify-center text-gray-300 hover:text-gray-600 disabled:opacity-30";
  const CLOSE =
    "flex h-6 w-6 items-center justify-center rounded text-gray-300 transition-colors hover:bg-red-50 hover:text-red-600";
  const FOOT_LINK =
    "rounded-md px-2 py-1 text-xxs font-semibold text-primary transition-colors hover:bg-primary/10";
  const FOOT_LINK_MUTED =
    "rounded-md px-2 py-1 text-xxs font-semibold text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600";

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 px-4 py-2">
        <span className="text-xs font-bold text-gray-800">เงื่อนไข/ข้อกำหนด</span>
        <span className="text-xxs text-gray-400">{tree.sections.length} หัวข้อ</span>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={addSection} className={HEAD_BTN}>
            + เพิ่มหัวข้อ
          </button>
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={!value}
            title="ล้างทุกอย่างที่แก้ในใบนี้ แล้วดึงค่าจาก Master กลับมา"
            className={HEAD_BTN}
          >
            ↺ คืนค่าจาก Master ทั้งหมด
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {profileMismatch && (
          <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xxs text-amber-800">
            แพ็กเกจในใบเปลี่ยนเป็นชุด <b>{PROFILE_LABEL[profile]}</b> แล้ว แต่เงื่อนไขที่แก้ไว้ยังเป็นชุด{" "}
            <b>{PROFILE_LABEL[tree.profile]}</b> — กด “คืนค่าจาก Master ทั้งหมด” เพื่อใช้ชุดที่ตรงกับแพ็กเกจ
          </div>
        )}

        {tree.sections.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-xs text-gray-400">
            ยังไม่มีหัวข้อ — เริ่มด้วย “+ เพิ่มหัวข้อ” หรือ “↺ คืนค่าจาก Master ทั้งหมด”
          </div>
        )}

        <div className="space-y-2">
          {tree.sections.map((section, sectionIndex) => {
            const sectionNo = numbering.get(section.key);
            const open = !collapsed[section.key];
            const canRestore = standardTree.sections.some(
              (candidate) => candidate.key === section.key,
            );
            return (
              <div key={section.key} className="rounded-xl border border-gray-200 bg-white">
                {/* หัวข้อ = บรรทัดหัวข้อที่ขึ้นบนเอกสาร
                    คลิกที่แถวตรงไหนก็กาง/หุบได้ ยกเว้นช่องพิมพ์และปุ่ม */}
                <div
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("input,textarea,button,[contenteditable]"))
                      return;
                    toggleSection(section.key);
                  }}
                  className="flex cursor-pointer items-center gap-1.5 px-2 py-1.5"
                >
                  <button
                    type="button"
                    onClick={() => toggleSection(section.key)}
                    aria-label={open ? "ย่อ" : "กาง"}
                    className="flex h-6 w-5 shrink-0 items-center justify-center text-gray-400 transition-transform hover:text-gray-600"
                  >
                    <span className={open ? "rotate-90" : ""}>▸</span>
                  </button>
                  {/* เลขข้อเหมือนบนเอกสาร — ซ่อนอยู่ในใบนี้จะเป็นขีดสีเทา */}
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg font-bold tabular-nums ${
                      sectionNo ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {sectionNo ?? "–"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <TermBodyInput
                      value={textOf(section.title)}
                      bold
                      placeholder="ชื่อหัวข้อบนเอกสาร"
                      onChange={(next) =>
                        update((draft) => {
                          draft.sections[sectionIndex].title = commitText(section.title, next);
                        })
                      }
                    />
                    {(!sectionNo || !open) && (
                      <div className="px-1.5 text-[11px] text-gray-400">
                        {[
                          !sectionNo && "ไม่ขึ้นบนเอกสาร",
                          !open && `${section.lines.length} บรรทัด`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center">
                    <button
                      type="button"
                      onClick={() => moveSection(sectionIndex, -1)}
                      disabled={sectionIndex === 0}
                      aria-label="เลื่อนขึ้น"
                      className={ARROW}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSection(sectionIndex, 1)}
                      disabled={sectionIndex === tree.sections.length - 1}
                      aria-label="เลื่อนลง"
                      className={ARROW}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        update((draft) => {
                          draft.sections.splice(sectionIndex, 1);
                        })
                      }
                      aria-label="ลบหัวข้อ"
                      className={CLOSE}
                    >
                      ×
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="border-t border-gray-100 pb-1">
                    {section.lines.map((line, lineIndex) => {
                      const lineNo = numbering.get(line.key);
                      return (
                        <div
                          key={line.key}
                          className="flex items-start gap-1.5 py-0.5 pl-2 pr-2 transition-colors hover:bg-primary/[0.03]"
                        >
                          {/* เลขข้อย่อย = ตัวนำหน้าบรรทัด ตรงกับที่พิมพ์ออก PDF */}
                          <span className="w-7 shrink-0 pt-2 text-right text-[11px] tabular-nums text-gray-400">
                            {lineNo ?? "–"}
                          </span>
                          <div className="min-w-0 flex-1">
                            <TermBodyInput
                              value={textOf(line.body, line.key, section.kind)}
                              placeholder="ข้อความที่จะขึ้นบนเอกสาร"
                              onChange={(next) =>
                                update((draft) => {
                                  draft.sections[sectionIndex].lines[lineIndex].body = commitText(
                                    line.body,
                                    next,
                                    line.key,
                                    section.kind,
                                  );
                                })
                              }
                            />
                            {!lineNo && (
                              <div className="px-2 pb-0.5 text-[11px] text-gray-400">
                                ซ่อนอยู่ในใบนี้ — ไม่ขึ้นบนเอกสาร
                              </div>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center pt-1">
                            <button
                              type="button"
                              onClick={() => moveLine(sectionIndex, lineIndex, -1)}
                              disabled={lineIndex === 0}
                              aria-label="เลื่อนขึ้น"
                              className={ARROW}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => moveLine(sectionIndex, lineIndex, 1)}
                              disabled={lineIndex === section.lines.length - 1}
                              aria-label="เลื่อนลง"
                              className={ARROW}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              onClick={() => removeLine(sectionIndex, lineIndex)}
                              aria-label="ลบบรรทัด"
                              className={CLOSE}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    <div className="flex flex-wrap items-center gap-1 pl-9 pr-2 pt-1">
                      <button type="button" onClick={() => addLine(sectionIndex)} className={FOOT_LINK}>
                        + เพิ่มรายละเอียด
                      </button>
                      {canRestore && (
                        <button
                          type="button"
                          onClick={() => restoreSection(sectionIndex)}
                          title="ดึงชื่อหัวข้อและข้อความจาก Master กลับมา — บรรทัดที่เพิ่มเองยังอยู่ ต่อท้ายให้"
                          className={FOOT_LINK_MUTED}
                        >
                          ↺ คืนค่าจาก Master หัวข้อนี้
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </>
  );
}
