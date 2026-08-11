import { useEffect, useState } from 'react';

// บทเรียน — หน้า /learn ของ reference (ใบ 11): 7 บทเรียน
// เนื้อหาเขียนใหม่เองทั้งหมด (ไม่คัดลอกจาก reference — ตัดสินใบ 09):
// หัวข้อ/โครงสร้างอ้างอิงจากหน้าต้นฉบับ แต่เนื้อหาเป็นของเรา
// progress เก็บ localStorage (ไม่มีระบบ auth) + ปุ่ม reset

const INK = {
  panel: '#101623',
  panelBorder: '#1e2940',
  ink: '#e8eef7',
  inkDim: '#8b9bb4',
  inkFaint: '#5a6b85',
  accent: '#38bdf8',
  emerald: '#34d399',
  amber: '#f59e0b',
};

interface LessonBlock {
  kind: 'paragraph' | 'heading' | 'list' | 'callout';
  text?: string;
  items?: string[];
}

interface Lesson {
  slug: string;
  icon: string;
  title: string;
  blurb: string;
  minutes: number;
  blocks: LessonBlock[];
}

const LESSONS: Lesson[] = [
  {
    slug: 'market-compass',
    icon: '🧭',
    title: 'เข็มทิศตลาดพันธบัตร',
    blurb: 'รู้จักเครื่องมือหลักที่ใช้บอกทิศทางของตลาดตราสารหนี้: yield curve, สเปรด, และอัตราแท้จริง',
    minutes: 6,
    blocks: [
      { kind: 'paragraph', text: 'ตลาดพันธบัตรคือ "ห้องเครื่อง" ของระบบการเงินโลก — ทุกอย่างตั้งแต่ราคาหุ้นไปจนถึงค่าเงินล้วนตอบสนองต่อการเคลื่อนไหวของอัตราดอกเบี้ย' },
      { kind: 'heading', text: 'Yield Curve คืออะไร' },
      { kind: 'paragraph', text: 'กราฟที่เชื่อมผลตอบแทนพันธบัตรอายุ 3 เดือนถึง 30 ปี บอกเราได้ว่าตลาดมองเศรษฐกิจระยะยาวอย่างไร' },
      { kind: 'list', items: ['ปกติ (ขึ้นชัน): เศรษฐกิจโตปกติ', 'แบน: ไม่แน่ใจในแนวโน้ม', 'กลับด้าน (inverted): มักมาก่อนภาวะถดถอย'] },
      { kind: 'callout', text: 'ตัวเลขที่ต้องรู้: 10Y-2Y ติดลบ = สัญญาณเตือนคลาสสิก (แม้ไม่ใช่ทุกครั้ง)' },
    ],
  },
  {
    slug: 'assets-coins',
    icon: '🪙',
    title: 'สินทรัพย์และเหรียญ',
    blurb: 'เจาะลึกสินทรัพย์ที่ตอบสนองไวต่อวิกฤตพันธบัตร: ทองคำ, ดอลลาร์, และคริปโต',
    minutes: 7,
    blocks: [
      { kind: 'paragraph', text: 'เมื่อพันธบัตรสั่นคลอน เงินจะไหลไปยังที่ปลอดภัย (safe haven) — แต่ละสินทรัพย์มีพฤติกรรมเฉพาะตัว' },
      { kind: 'list', items: ['ทองคำ: แท่นที่ปลอดภัยดั้งเดิม — แพงขึ้นเมื่ออัตราแท้จริงติดลบ', 'ดอลลาร์ (DXY): แข็งค่าจากสภาพคล่องตึงตัว (dash for cash)', 'คริปโต: เสี่ยงสูง — มักร่วงพร้อมหุ้นในวันตื่นตระหนก'] },
      { kind: 'callout', text: 'ข้อควรจำ: "ที่ปลอดภัย" ไม่ได้แปลว่า "ขึ้นเสมอ" — ในวันที่ทุกอย่างขายพร้อมกัน ทองก็ร่วงได้' },
    ],
  },
  {
    slug: 'risk-gauge',
    icon: '📏',
    title: 'เกจ์วัดความเสี่ยง',
    blurb: 'วิธีอ่านมาตรวัดความเครียดของระบบ: จากปกติ → เฝ้าระวัง → วิกฤต',
    minutes: 5,
    blocks: [
      { kind: 'paragraph', text: 'ระบบของเราคำนวณ "ดัชนีความเสี่ยงแบงก์รัน" จาก 8 ตัวชี้วัดจริง (SOFR-EFFR, เงินฝาก, Discount Window, หุ้นแบงก์ และอื่นๆ)' },
      { kind: 'list', items: ['0-30: ปกติ', '30-60: เฝ้าระวัง', '60+: วิกฤต'] },
      { kind: 'callout', text: 'จำไว้ว่า: ตัวชี้วัดรายตัวอาจหลอกได้ — ดูภาพรวม (composite) ประกอบเสมอ' },
    ],
  },
  {
    slug: 'network-map',
    icon: '🕸️',
    title: 'เครือข่ายความเชื่อมโยง',
    blurb: 'ทำไมวิกฤตพันธบัตรญี่ปุ่นถึงกระทบตลาดโลก — เรียนรู้กลไกการแพร่กระจาย',
    minutes: 6,
    blocks: [
      { kind: 'paragraph', text: 'ระบบการเงินเชื่อมโยงกันผ่าน 3 ช่องทางหลัก: การค้า, การเงิน, และความเชื่อมั่น (sentiment)' },
      { kind: 'list', items: ['การค้า: เงินเยนอ่อน → ต้นทุนนำเข้าสูงทั่วเอเชีย', 'การเงิน: carry trade ยุบ → ขายสินทรัพย์ทั่วโลก', 'ความเชื่อมั่น: ข่าวเดียวทำให้ทุกตลาดสั่นพร้อมกัน'] },
    ],
  },
  {
    slug: 'charts-basics',
    icon: '📊',
    title: 'อ่านกราฟแท่งเทียน',
    blurb: 'พื้นฐานการอ่านกราฟราคาและปริมาณสำหรับผู้เริ่มต้น',
    minutes: 5,
    blocks: [
      { kind: 'paragraph', text: 'แท่งเทียน 1 แท่ง = ราคาเปิด/สูง/ต่ำ/ปิดในช่วงเวลานั้น — สีบอกทิศทาง (เขียว=ขึ้น, แดง=ลง)' },
      { kind: 'list', items: ['ลำตัว (body): ช่วงเปิด-ปิด', 'ไส้เทียน (wick): ช่วงสูงสุด-ต่ำสุด', 'ปริมาณ (volume): ยืนยันความเชื่อมั่น'] },
    ],
  },
  {
    slug: 'calendar-events',
    icon: '📅',
    title: 'ปฏิทินเศรษฐกิจ',
    blurb: 'รู้จักอีเวนต์ที่ขยับตลาดที่สุด: CPI, FOMC, ประชุมธนาคารกลาง และประมูลพันธบัตร',
    minutes: 6,
    blocks: [
      { kind: 'paragraph', text: 'อีเวนต์ "High impact" เปลี่ยนราคาได้ในไม่กี่วินาที — รู้ก่อน = ได้เปรียบ' },
      { kind: 'list', items: ['CPI/PCE: วัดเงินเฟ้อ — ตัวตั้งของนโยบายเฟด', 'FOMC: การประชุมเฟด — เปลี่ยนอัตราดอกเบี้ย', 'ประมูลพันธบัตร: Bid-to-Cover ต่ำ = ความต้องการอ่อนแอ'] },
    ],
  },
  {
    slug: 'signal-flags',
    icon: '🚩',
    title: 'ธงสัญญาณเตือน',
    blurb: 'รายการธงแดงที่ควรจับตา: หางประมูล, สเปรดบอนด์, เงินฝากธนาคาร และอื่นๆ',
    minutes: 5,
    blocks: [
      { kind: 'paragraph', text: 'ระบบจะแสดง "การแจ้งเตือน" เมื่อตัวชี้วัดข้ามเกณฑ์ — รู้ว่าอันไหนสำคัญจริง' },
      { kind: 'list', items: ['หางประมูล (tail) > 3 bps: ความต้องการอ่อน', 'HY spread พุ่ง: ความเสี่ยงเครดิตขยาย', 'เงินฝากธนาคารลดต่อเนื่อง: สัญญาณแบงก์รัน'] },
      { kind: 'callout', text: 'ธงแดงเดียวไม่พอ — ต้องมีอย่างน้อย 2-3 ตัวยืนยันพร้อมกัน' },
    ],
  },
];

const PROGRESS_KEY = 'bondcrisis:lesson_progress';

export function LearnDashboard() {
  const [openLesson, setOpenLesson] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      if (raw) setCompleted(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const toggleComplete = (slug: string) => {
    setCompleted((prev) => {
      const next = { ...prev, [slug]: !prev[slug] };
      try {
        localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
  };

  const reset = () => {
    setCompleted({});
    try { localStorage.removeItem(PROGRESS_KEY); } catch { /* ignore */ }
  };

  const doneCount = Object.values(completed).filter(Boolean).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 12,
        padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
      }}>
        <div>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: INK.ink }}>📚 บทเรียนสมาชิก</div>
          <div style={{ fontSize: '0.78rem', color: INK.inkDim, marginTop: 2 }}>
            เรียนจบ {doneCount}/{LESSONS.length} บท · {LESSONS.reduce((s, l) => s + l.minutes, 0)} นาทีรวม
          </div>
        </div>
        <button onClick={reset} style={{
          padding: '6px 12px', borderRadius: 8, border: `1px solid ${INK.panelBorder}`,
          background: 'transparent', color: INK.inkDim, fontSize: '0.75rem', cursor: 'pointer',
        }}>รีเซ็ตความคืบหน้า</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {LESSONS.map((lesson) => {
          const open = openLesson === lesson.slug;
          const done = !!completed[lesson.slug];
          return (
            <div key={lesson.slug} style={{
              background: INK.panel, border: `1px solid ${open ? 'rgba(56,189,248,0.35)' : INK.panelBorder}`,
              borderRadius: 12, overflow: 'hidden',
            }}>
              <button onClick={() => setOpenLesson(open ? null : lesson.slug)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
              }}>
                <span style={{ fontSize: '1.3rem' }}>{lesson.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: INK.ink }}>
                    {lesson.title} <span style={{ fontSize: '0.68rem', color: INK.inkFaint, fontWeight: 400 }}>· {lesson.minutes} นาที</span>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: INK.inkDim, marginTop: 2 }}>{lesson.blurb}</div>
                </div>
                <span style={{
                  width: 20, height: 20, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: done ? 'rgba(52,211,153,0.2)' : 'transparent',
                  border: `1px solid ${done ? INK.emerald : INK.panelBorder}`,
                  color: done ? INK.emerald : 'transparent', fontSize: '0.7rem', fontWeight: 800,
                }}>✓</span>
              </button>
              {open && (
                <div style={{ padding: '4px 16px 14px 52px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {lesson.blocks.map((b, i) => (
                    <div key={i}>
                      {b.kind === 'heading' && (
                        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: INK.accent, marginTop: 4 }}>{b.text}</div>
                      )}
                      {b.kind === 'paragraph' && (
                        <p style={{ margin: 0, fontSize: '0.82rem', color: INK.inkDim, lineHeight: 1.65 }}>{b.text}</p>
                      )}
                      {b.kind === 'list' && (
                        <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {b.items?.map((it, j) => (
                            <li key={j} style={{ fontSize: '0.8rem', color: INK.inkDim, lineHeight: 1.5 }}>{it}</li>
                          ))}
                        </ul>
                      )}
                      {b.kind === 'callout' && (
                        <div style={{
                          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
                          borderRadius: 8, padding: '8px 12px', fontSize: '0.78rem', color: INK.amber,
                        }}>💡 {b.text}</div>
                      )}
                    </div>
                  ))}
                  <button onClick={() => toggleComplete(lesson.slug)} style={{
                    alignSelf: 'flex-start', padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
                    background: done ? 'rgba(52,211,153,0.15)' : 'transparent',
                    border: `1px solid ${done ? INK.emerald : INK.panelBorder}`,
                    color: done ? INK.emerald : INK.inkDim, fontSize: '0.75rem', fontWeight: 700,
                  }}>
                    {done ? '✓ เรียนจบแล้ว — ยกเลิก' : 'ทำเครื่องหมายเรียนจบ'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
