"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  QUOTATION_TERM_PLACEHOLDERS,
  getStandardQuotationTermLines,
  getQuotationTermTreeDiff,
  renderQuotationTermTree,
  seedQuotationTermTree,
  type QuotationOmSettings,
  type QuotationTermLine,
  type QuotationTermTree,
  type QuotationTermsProfile,
} from "@/lib/quotation-terms";

const PROFILE_LABEL: Record<QuotationTermsProfile, string> = {
  full_install: "ติดตั้งใหม่ทั้งระบบ",
  additional_install: "ติดตั้งเพิ่ม",
};

// โควตาบรรทัด — วัดเทียบกับ "ชุดมาตรฐาน" ของใบนั้นเอง ไม่ใช้ตัวเลขตายตัว
// เพราะพื้นที่ว่างบนหน้า 1 ขึ้นกับจำนวนแถวรายการของแต่ละใบ ตัวเลขตายตัวจึง
// เตือนหลอกตั้งแต่ยังไม่มีใครแก้อะไร ชุดมาตรฐานพิมพ์ลงกระดาษได้แน่นอนอยู่แล้ว
// จึงใช้เป็นเส้นฐาน แล้วเผื่อระยะไว้เท่านี้ก่อนจะเตือน
const PAGE_HEADROOM = { 1: 4, 2: 8 } as const;
const CHARS_PER_RENDERED_LINE = 95;

const countRenderedLines = (text: string) =>
  Math.max(1, Math.ceil(text.length / CHARS_PER_RENDERED_LINE));

function measurePages(content: ReturnType<typeof renderQuotationTermTree>) {
  const used = { 1: 0, 2: 0 };
  for (const section of content.page1Sections) {
    used[1] += countRenderedLines(section.title);
    for (const paragraph of section.paragraphs) used[1] += countRenderedLines(paragraph);
  }
  for (const paragraph of content.page2LeadingParagraphs) used[2] += countRenderedLines(paragraph);
  for (const section of content.page2Sections) {
    used[2] += countRenderedLines(section.title);
    for (const paragraph of section.paragraphs) used[2] += countRenderedLines(paragraph);
  }
  return used;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const newKey = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ── ช่องพิมพ์ที่แสดง {{key}} เป็นป้ายสี ลบได้ทั้งก้อน แต่พิมพ์ทับข้างในไม่ได้ ──
const escapeHtml = (text: string) =>
  text.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]!);

const CHIP_CLASS =
  "mx-0.5 inline-flex select-none items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-px align-baseline text-[11px] font-bold text-violet-700";

function bodyToHtml(body: string) {
  return escapeHtml(body).replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (all, key: string) => {
    const found = QUOTATION_TERM_PLACEHOLDERS.find((item) => item.key === key);
    if (!found) return all;
    return `<span class="${CHIP_CLASS}" contenteditable="false" data-ph="${key}">⌗ ${escapeHtml(found.label)}</span>`;
  });
}

function nodeToText(root: HTMLElement): string {
  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const key = node.dataset.ph;
    if (key) {
      out += `{{${key}}}`;
      return;
    }
    if (node.tagName === "BR") {
      out += " ";
      return;
    }
    node.childNodes.forEach(walk);
  };
  root.childNodes.forEach(walk);
  return out.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

function TermBodyInput({
  value,
  locked,
  bold,
  onChange,
  onFocus,
  registerInsert,
}: {
  value: string;
  locked?: boolean;
  bold?: boolean;
  onChange: (next: string) => void;
  onFocus: () => void;
  registerInsert: (insert: ((key: string) => void) | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // เขียน HTML ทับเฉพาะตอนค่าจากภายนอกไม่ตรงกับที่พิมพ์อยู่ (เช่นกดคืนค่า)
  // ไม่งั้น caret จะเด้งกลับต้นบรรทัดทุกครั้งที่พิมพ์
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (nodeToText(el) === value) return;
    el.innerHTML = bodyToHtml(value);
  }, [value]);

  const insertPlaceholder = useCallback((key: string) => {
    const el = ref.current;
    if (!el || locked) return;
    const found = QUOTATION_TERM_PLACEHOLDERS.find((item) => item.key === key);
    if (!found) return;
    const chip = document.createElement("span");
    chip.className = CHIP_CLASS;
    chip.contentEditable = "false";
    chip.dataset.ph = key;
    chip.textContent = `⌗ ${found.label}`;

    const selection = window.getSelection();
    const range =
      selection && selection.rangeCount > 0 && el.contains(selection.anchorNode)
        ? selection.getRangeAt(0)
        : null;
    if (range) {
      range.deleteContents();
      range.insertNode(chip);
      range.setStartAfter(chip);
      range.collapse(true);
      selection!.removeAllRanges();
      selection!.addRange(range);
    } else {
      el.appendChild(document.createTextNode(" "));
      el.appendChild(chip);
    }
    onChange(nodeToText(el));
    el.focus();
  }, [locked, onChange]);

  return (
    <div
      ref={ref}
      contentEditable={!locked}
      suppressContentEditableWarning
      role="textbox"
      tabIndex={0}
      onInput={() => ref.current && onChange(nodeToText(ref.current))}
      onBlur={() => {
        registerInsert(null);
        if (ref.current) onChange(nodeToText(ref.current));
      }}
      onFocus={() => {
        onFocus();
        registerInsert(locked ? null : insertPlaceholder);
      }}
      className={`min-h-[30px] w-full rounded-lg border border-transparent px-2 py-1 text-xs leading-relaxed outline-none transition-colors ${
        bold ? "font-bold text-gray-800" : ""
      } ${
        locked
          ? "cursor-not-allowed text-gray-500"
          : "hover:border-gray-200 focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/10"
      } ${locked || bold ? "" : "text-gray-700"}`}
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
  const [focusedLine, setFocusedLine] = useState<string | null>(null);
  const insertRef = useRef<((key: string) => void) | null>(null);
  const [insertReady, setInsertReady] = useState(false);

  const tree = useMemo(
    () => value ?? seedQuotationTermTree(profile, legacyTermsText),
    [value, profile, legacyTermsText],
  );
  const standardLines = useMemo(() => getStandardQuotationTermLines(tree.profile), [tree.profile]);
  const diff = useMemo(() => getQuotationTermTreeDiff(tree), [tree]);
  const rendered = useMemo(
    () => renderQuotationTermTree(tree, { validDays, om }),
    [tree, validDays, om],
  );

  // เลขข้อจริงของแต่ละบรรทัดหลังไล่เลข — เอาไว้โชว์หน้า numtag ให้ตรงกับ PDF
  const numbering = useMemo(() => {
    const map = new Map<string, string>();
    const visible = (showWhen: QuotationTermLine["showWhen"]) => {
      switch (showWhen) {
        case "om_visible":
          return om.enabled && (om.cleaning.enabled || om.thermoscan.enabled || om.visual_inspection.enabled);
        case "om_cleaning":
          return om.enabled && om.cleaning.enabled;
        case "om_thermoscan":
          return om.enabled && om.thermoscan.enabled;
        case "om_visual":
          return om.enabled && om.visual_inspection.enabled;
        default:
          return true;
      }
    };
    let sectionNo = 0;
    for (const section of tree.sections) {
      if (!visible(section.showWhen)) continue;
      const lines = section.lines.filter((line) => visible(line.showWhen));
      if (lines.length === 0) continue;
      sectionNo += 1;
      map.set(section.key, String(sectionNo));
      lines.forEach((line, index) => map.set(line.key, `${sectionNo}.${index + 1}`));
    }
    return map;
  }, [tree, om]);

  const usage = useMemo(() => measurePages(rendered), [rendered]);
  const budget = useMemo(() => {
    const standard = measurePages(
      renderQuotationTermTree(seedQuotationTermTree(tree.profile), { validDays, om }),
    );
    return {
      1: standard[1] + PAGE_HEADROOM[1],
      2: standard[2] + PAGE_HEADROOM[2],
    };
  }, [tree.profile, validDays, om]);
  const overflowing = usage[1] > budget[1] || usage[2] > budget[2];

  const update = useCallback(
    (mutate: (draft: QuotationTermTree) => void) => {
      const draft = clone(tree);
      mutate(draft);
      onChange(draft);
    },
    [tree, onChange],
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

  const removeLine = (sectionIndex: number, lineIndex: number) =>
    update((draft) => {
      const [gone] = draft.sections[sectionIndex].lines.splice(lineIndex, 1);
      if (standardLines.has(gone.key)) {
        draft.removed = [...(draft.removed ?? []), gone];
      }
    });

  const restoreRemoved = (key: string) =>
    update((draft) => {
      const index = (draft.removed ?? []).findIndex((line) => line.key === key);
      if (index < 0) return;
      const [line] = draft.removed!.splice(index, 1);
      const standardTree = seedQuotationTermTree(draft.profile);
      const home = standardTree.sections.find((section) =>
        section.lines.some((candidate) => candidate.key === line.key),
      );
      const at =
        home?.lines.findIndex((candidate) => candidate.key === line.key) ?? -1;
      const target =
        draft.sections.find((section) => section.key === home?.key) ?? draft.sections[0];
      if (!target) return;
      target.lines.splice(Math.min(Math.max(at, 0), target.lines.length), 0, line);
      if (draft.removed!.length === 0) delete draft.removed;
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

  const addSection = () =>
    update((draft) => {
      draft.sections.push({
        key: newKey("s"),
        title: "",
        page: 2,
        kind: "normal",
        lines: [{ key: newKey("c"), body: "", page: 2, origin: "custom" }],
      });
    });

  const isEdited = (line: QuotationTermLine) => {
    const standard = standardLines.get(line.key);
    return Boolean(standard && standard.body !== line.body);
  };

  const previewOf = (line: QuotationTermLine) => {
    const number = numbering.get(line.key);
    if (!number) return null;
    for (const section of [...rendered.page1Sections, ...rendered.page2Sections]) {
      const hit = section.paragraphs.find((paragraph) => paragraph.startsWith(`${number}) `));
      if (hit) return hit;
    }
    return rendered.page2LeadingParagraphs.find((paragraph) => paragraph.startsWith(`${number}) `)) ?? null;
  };

  const profileMismatch = tree.profile !== profile;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
      {/* ที่มาของชุดตั้งต้น + ปุ่มคืนค่า */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xxs font-bold text-primary">
          ชุดมาตรฐาน
        </span>
        <span className="text-xxs text-gray-500">
          เริ่มจากชุด <b className="text-gray-700">{PROFILE_LABEL[tree.profile]}</b> — เลือกอัตโนมัติจากแพ็กเกจในใบนี้ ·
          แก้ทุกอย่างได้เฉพาะใบนี้ <b className="text-gray-700">ไม่กระทบใบอื่น</b>
        </span>
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={!value}
          className="ml-auto h-8 shrink-0 rounded-lg border border-gray-200 bg-white px-3 text-xxs font-bold text-gray-700 transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-40"
        >
          ↺ คืนค่าชุดมาตรฐานทั้งหมด
        </button>
      </div>

      {profileMismatch && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xxs text-amber-800">
          แพ็กเกจในใบเปลี่ยนเป็นชุด <b>{PROFILE_LABEL[profile]}</b> แล้ว แต่เงื่อนไขที่แก้ไว้ยังเป็นชุด{" "}
          <b>{PROFILE_LABEL[tree.profile]}</b> — กด “คืนค่าชุดมาตรฐานทั้งหมด” เพื่อใช้ชุดที่ตรงกับแพ็กเกจ
        </div>
      )}

      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-bold text-gray-800">หัวข้อและข้อความ</span>
        <span className="text-xxs text-gray-400">
          {tree.sections.length} หัวข้อ ·{" "}
          {tree.sections.reduce((total, section) => total + section.lines.length, 0)} บรรทัด
          {diff.total > 0 && ` · ต่างจากมาตรฐาน ${diff.total} จุด`}
        </span>
      </div>

      {(tree.removed?.length ?? 0) > 0 && (
        <div className="mb-2 space-y-1">
          {tree.removed!.map((line) => (
            <div
              key={line.key}
              className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white px-3 py-1.5"
            >
              <span className="min-w-0 flex-1 truncate text-xxs text-gray-500">
                ลบข้อของชุดมาตรฐานไปแล้ว — “{line.body}”
              </span>
              <button
                type="button"
                onClick={() => restoreRemoved(line.key)}
                className="h-7 shrink-0 rounded-md border border-gray-200 px-2.5 text-[11px] font-bold text-gray-700 hover:border-primary/40 hover:text-primary"
              >
                คืนข้อที่ลบ
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {tree.sections.map((section, sectionIndex) => {
          const sectionNo = numbering.get(section.key);
          return (
            <div key={section.key} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-2.5 py-2">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                    sectionNo ? "bg-primary text-white" : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {sectionNo ?? "–"}
                </span>
                <div className="min-w-0 flex-1">
                  {/* ชื่อหัวข้อก็มี {{placeholder}} ได้ (เช่น O&M N ปี) จึงใช้ตัวแก้ตัวเดียวกัน
                      ไม่งั้นผู้ใช้จะเห็น {{om_years}} ดิบ ๆ ในช่องชื่อ */}
                  <TermBodyInput
                    value={section.title}
                    bold
                    onFocus={() => setFocusedLine(`section:${section.key}`)}
                    registerInsert={(fn) => {
                      insertRef.current = fn;
                      setInsertReady(Boolean(fn));
                    }}
                    onChange={(next) =>
                      update((draft) => {
                        draft.sections[sectionIndex].title = next;
                      })
                    }
                  />
                  <div className="px-1.5 text-[11px] text-gray-400">
                    หน้า {section.page}
                    {section.showWhen === "om_visible" && " · แสดงเฉพาะเมื่อเปิด O&M"}
                    {!sectionNo && " · ซ่อนอยู่ในใบนี้"}
                  </div>
                </div>
                <div className="flex shrink-0 items-center">
                  <button type="button" onClick={() => moveSection(sectionIndex, -1)} className="h-7 w-7 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700">↑</button>
                  <button type="button" onClick={() => moveSection(sectionIndex, 1)} className="h-7 w-7 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700">↓</button>
                  <button
                    type="button"
                    onClick={() =>
                      update((draft) => {
                        const [gone] = draft.sections.splice(sectionIndex, 1);
                        const orphans = gone.lines.filter((line) => standardLines.has(line.key));
                        if (orphans.length) draft.removed = [...(draft.removed ?? []), ...orphans];
                      })
                    }
                    className="h-7 w-7 rounded-md text-gray-400 hover:bg-red-50 hover:text-red-500"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="px-2.5 py-1.5">
                {section.lines.map((line, lineIndex) => {
                  const lineNo = numbering.get(line.key);
                  const focused = focusedLine === line.key;
                  const preview = focused ? previewOf(line) : null;
                  return (
                    <div
                      key={line.key}
                      className={`grid grid-cols-[26px_minmax(0,1fr)_auto] items-start gap-1.5 border-b border-gray-100 py-1.5 last:border-b-0 ${
                        focused ? "rounded-lg bg-sky-50/40" : ""
                      }`}
                    >
                      <span className="pt-2 text-[11px] tabular-nums text-gray-400">{lineNo ?? "–"}</span>
                      <div className="min-w-0">
                        <TermBodyInput
                          value={line.body}
                          locked={line.locked}
                          onFocus={() => setFocusedLine(line.key)}
                          registerInsert={(fn) => {
                            insertRef.current = fn;
                            setInsertReady(Boolean(fn));
                          }}
                          onChange={(next) =>
                            update((draft) => {
                              draft.sections[sectionIndex].lines[lineIndex].body = next;
                            })
                          }
                        />
                        <div className="flex flex-wrap items-center gap-1.5 px-2">
                          {line.locked && (
                            <span className="rounded-full bg-gray-100 px-2 py-px text-[11px] font-bold text-gray-500">
                              🔒 บังคับมีทุกใบ
                            </span>
                          )}
                          {isEdited(line) && (
                            <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-px text-[11px] font-bold text-violet-700">
                              แก้แล้ว
                            </span>
                          )}
                          {!standardLines.has(line.key) && (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-px text-[11px] font-bold text-emerald-700">
                              เพิ่มเองในใบนี้
                            </span>
                          )}
                          {!lineNo && (
                            <span className="text-[11px] text-gray-400">ซ่อนอยู่ในใบนี้</span>
                          )}
                        </div>

                        {focused && !line.locked && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-dashed border-gray-200 px-2 pt-1.5">
                            <span className="text-[11px] text-gray-400">แทรกค่า:</span>
                            {QUOTATION_TERM_PLACEHOLDERS.map((placeholder) => {
                              const misplaced =
                                placeholder.omServiceOnly && section.kind !== "om_services";
                              return (
                                <button
                                  key={placeholder.key}
                                  type="button"
                                  disabled={!insertReady}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    insertRef.current?.(placeholder.key);
                                  }}
                                  title={
                                    misplaced
                                      ? "ค่านี้ใช้ได้เฉพาะในหัวข้อบริการ O&M — นอกหัวข้อนั้นจะพิมพ์ออกมาเป็นค่าว่าง"
                                      : undefined
                                  }
                                  className={`h-6 rounded-full border px-2 text-[11px] font-bold transition-colors disabled:opacity-40 ${
                                    misplaced
                                      ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                                      : "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"
                                  }`}
                                >
                                  + {placeholder.label}
                                  {misplaced && " ⚠"}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {preview && (
                          <div className="mt-1.5 rounded-lg border border-gray-200 border-l-[3px] border-l-primary bg-gray-50 px-2.5 py-1.5">
                            <div className="text-[11px] font-bold tracking-wide text-gray-400">
                              ผลจริงบนใบนี้
                            </div>
                            <div className="mt-0.5 text-xs leading-relaxed text-gray-700">{preview}</div>
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center pt-1">
                        <button type="button" onClick={() => moveLine(sectionIndex, lineIndex, -1)} className="h-7 w-7 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700">↑</button>
                        <button type="button" onClick={() => moveLine(sectionIndex, lineIndex, 1)} className="h-7 w-7 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700">↓</button>
                        {!line.locked && (
                          <button
                            type="button"
                            onClick={() => removeLine(sectionIndex, lineIndex)}
                            className="h-7 w-7 rounded-md text-gray-400 hover:bg-red-50 hover:text-red-500"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => addLine(sectionIndex)}
                  className="mt-1 h-8 rounded-lg border border-dashed border-gray-300 px-3 text-xxs font-bold text-gray-500 transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
                >
                  + เพิ่มบรรทัด
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={addSection}
        className="mt-2 h-9 w-full rounded-xl border border-dashed border-gray-300 text-xxs font-bold text-gray-500 transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
      >
        + เพิ่มหัวข้อใหม่
      </button>

      {/* พื้นที่บนเอกสาร — เตือนก่อนข้อความล้นไปทับเลขหน้า */}
      <div className="mt-3 rounded-xl border border-gray-200 bg-white p-2.5">
        <div className="text-xs font-bold text-gray-700">พื้นที่บนเอกสาร</div>
        <div className="text-[11px] text-gray-400">เทียบกับชุดมาตรฐานที่พิมพ์ลงกระดาษได้แน่นอน</div>
        {([1, 2] as const).map((page) => {
          const limit = budget[page];
          const used = usage[page];
          const over = used > limit;
          return (
            <div key={page} className="mt-1.5">
              <div className="flex items-center justify-between text-[11px] text-gray-500">
                <span>หน้า {page}</span>
                <b className={over ? "text-amber-700" : "text-gray-700"}>
                  {used} / {limit} บรรทัด
                </b>
              </div>
              <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <i
                  className={`block h-full rounded-full ${over ? "bg-amber-500" : "bg-primary"}`}
                  style={{ width: `${Math.min(100, (used / limit) * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
        {overflowing && (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] leading-relaxed text-amber-800">
            ข้อความยาวกว่าชุดมาตรฐานพอสมควร — เสี่ยงล้นไปทับเลขหน้าและทำให้ PDF
            ออกไม่ครบ 17 หน้า กด “ดูตัวอย่าง PDF” ตรวจก่อนส่งอนุมัติ
          </div>
        )}
      </div>
    </div>
  );
}
