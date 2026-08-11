# Research — Reference Office 3D Architecture (2026-08-11)

> ใบ 02 แผน multi-agent-trade-desk

## แหล่ง

- **Preview**: office page (`bond-crisis-dashboard-v2.vercel.app/office`) — user login แล้ว
- **JS dig**: office-page.js (63KB — main component), chunk-8184 (dynamic import wrapper), chunk-8673 (shared UI)
- **3D library**: React Three Fiber (`@react-three/fiber` — module 67909) + Three.js (shared in framework chunks)
- **Room data**: module 45333 — `u.YN.rooms`

## 1. แผนก (Departments) — 13 หน่วย

จากหน้า preview:

| แผนก | ตัวเลข | หมายเหตุ |
|---|---|---|
| ห้องประชุมบอร์ด | 15 | signals/decisions |
| ศูนย์โมเดลทำกำไร | 6 | active models |
| โต๊ะเทรด 9 ทีม | 63 | total positions? |
| หัวหน้าโต๊ะเทรด | 1 | lead trader |
| ศูนย์ข้อมูลตลาด | 4 | data feeds |
| ฝ่ายข่าว | 2 | news analysts |
| ควอนต์ CME | 2 | CME specialists |
| โต๊ะต่างประเทศ | 2 | country desk |
| ต้อนรับ + สื่อสาร | 3 | reception + comms |
| บัญชี AI | 1 | AI accountant |
| ศูนย์รวมสัญญาณ | 3 | signal center |

รวม AI teams: claude, gpt, gemini, deepseek, grok, glm, kimi, qwen, mistral (9 ทีม)

## 2. Character System

แต่ละตัวละครมี:
- `kind`: `"board"` (AI team member) หรือ `"staff"` 
- `dept`: department ID → จับคู่กับ `rooms[].id`
- `family`: team name (สำหรับ board members)
- `seatId`: seat ใน meeting
- `provider`: AI model name (สำหรับ board members)
- `roleTh/roleEn`: บทบาท
- `labelTh/labelEn`: ชื่อตัวละคร
- `color`: สีประจำตัว

**Board member states**:
- `idle` — ว่าง
- `in_meeting` — อยู่ในห้องประชุมแต่ไม่ใช่คนพูด
- `speaking` — กำลังพูดในที่ประชุม (แสดง animation/pulse)

## 3. Data Model

### State object (จากการ polling — module 77823):
```typescript
{
  pipeline: JobRun[],      // งานระบบล่าสุด
  teams: TeamState[],      // per-team trading state
  meeting: MeetingState | null,  // current boardroom meeting
}
```

### Team state:
```typescript
{
  family: string,         // team name
  nameTh: string,
  openPositions: number,
  turnsToday: number,
  nextTurnAt: string,     // ISO datetime
  claimUntil: string | null,  // if team holds a claim
}
```

### Meeting state:
```typescript
{
  status: "running" | "idle",
  currentSeat: string,    // who's speaking
}
```

### Pipeline (job runs):
จาก preview: `cme-brief`, `trade-tick`, `fetch-market-data`, `scoring-engine`, `fetch-sentiment`, `boardroom-trigger`

### Turn triggers (เหตุผลที่เรียกเทิร์น):
```javascript
M = {
  manual: "สั่งเอง",
  news: "ข่าวใหญ่", 
  model: "โมเดลขยับ",
  calendar: "ปฏิทินเศรษฐกิจ"
}
```

## 4. Interaction Model

| Action | Effect |
|---|---|
| **ลาก (left-drag)** | หมุนกล้อง (orbit) |
| **สกรอลล์** | ซูมเข้า/ออก |
| **คลิกขวา-ลาก** | เลื่อนกล้อง (pan) |
| **คลิกตัวละคร** | แสดงการ์ดข้อมูล (CharacterCard) |
| **ดับเบิลคลิกตัวละคร** | กล้องบินไปหาตัวละคร (zoom to) |
| **คลิกชื่อแผนก** | กล้องบินไปแผนกนั้น |
| **Esc** | รีเซ็ตมุมกล้องเริ่มต้น |
| **Click away** | ปิดการ์ดข้อมูล |

## 5. UI Overlay (2D บน 3D scene)

จากการ์ดข้อมูล (CharacterCard — ฟังก์ชัน `j`):
- ชื่อ + สี
- บทบาท + แผนก
- AI provider (ถ้าเป็น board member)
- สถานะ (speaking/in meeting/idle) — พร้อม animation
- ข้อมูลทีม (open positions, turns today, next turn)
- "สั่งเอง", "ข่าวใหญ่", "โมเดลขยับ", "ปฏิทินเศรษฐกิจ" — trigger badges

**ภาพรวม** (ซ้ายบน?):
- ห้องประชุม: ว่าง/ประชุม
- ทีมกำลังถือเทิร์น: 0/9
- ไม้ที่เปิดอยู่: 17
- ข่าวล่าสุดเมื่อ: Xm

**News ticker**: แถบข่าววิ่งด้านล่าง

**งานระบบล่าสุด**: job run list พร้อมเวลา (e.g. "cme-brief 2m")

**คิวงานถัดไป**: team turns queue (e.g. "gemini เทิร์นใน 21:38")

## 6. 3D Implementation Notes

- **Library**: React Three Fiber (`@react-three/fiber`) — React wrapper for Three.js
- **Room data**: `u.YN.rooms` — static data with room positions, labels
- **3D assets**: ไม่พบ URL assets ใน office-page.js — อาจใช้ procedural geometry (boxes, planes) หรือ embedded in shared chunks
- **Camera controls**: OrbitControls (rotate/zoom/pan)
- **Character rendering**: แต่ละตัวละครอาจเป็น Sprite, Billboard, หรือ simple geometry + text label
- **Department layout**: rooms arranged in a 2D grid or floor plan — camera orbits around

## 7. Implication สำหรับเรา

ของเราควรมี:
- **React Three Fiber** (ติดตั้งแล้ว — three 0.185 ใน project)
- **Room/department data** — static config
- **Character data** — 1 team deepseek → 5 characters (lead + 4 analysts) + staff departments
- **State polling** — job runs + team state + meeting state
- **Character cards** — click popup
- **Camera controls** — OrbitControls
- **News ticker + overview + job runs + queue** — HTML overlay บน 3D canvas

**สิ่งที่เราไม่มี (ยัง)**: meeting system (boardroom signals) — ต้อง integrate กับ boardroom service ที่มีอยู่
