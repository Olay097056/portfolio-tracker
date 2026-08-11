import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Text, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { getJobStatus } from '../../api/client';
import type { JobRunView } from '../../api/types';

// ── Config ──────────────────────────────────────────────────────────────────
const ROOMS: { id: string; label: string; pos: [number, number]; color: string; w: number; d: number }[] = [
  { id: 'boardroom', label: 'ห้องประชุมบอร์ด', pos: [0, 0], color: '#6366f1', w: 3, d: 3 },
  { id: 'trade_lead', label: 'หัวหน้าโต๊ะเทรด', pos: [4, 0], color: '#f59e0b', w: 2, d: 2 },
  { id: 'trade_deepseek', label: 'ทีม DeepSeek', pos: [7, 0], color: '#38bdf8', w: 3, d: 3 },
  { id: 'models', label: 'ศูนย์โมเดลทำกำไร', pos: [0, 4], color: '#10b981', w: 2.5, d: 2 },
  { id: 'data', label: 'ศูนย์ข้อมูลตลาด', pos: [3, 4], color: '#8b5cf6', w: 2, d: 2 },
  { id: 'signals', label: 'ศูนย์รวมสัญญาณ', pos: [6, 4], color: '#ec4899', w: 2, d: 2 },
  { id: 'news', label: 'ฝ่ายข่าว', pos: [0, 7], color: '#f43f5e', w: 2, d: 2 },
  { id: 'cme', label: 'ควอนต์ CME', pos: [3, 7], color: '#14b8a6', w: 2, d: 2 },
  { id: 'exchange', label: 'ตู้ Exchange', pos: [6, 7], color: '#84cc16', w: 2, d: 2 },
  { id: 'intl', label: 'โต๊ะต่างประเทศ', pos: [0, 10], color: '#eab308', w: 2, d: 2 },
  { id: 'reception', label: 'ต้อนรับ+สื่อสาร', pos: [3, 10], color: '#06b6d4', w: 2.5, d: 2 },
  { id: 'accounting', label: 'บัญชี AI', pos: [6, 10], color: '#a855f7', w: 2, d: 2 },
];

const INK = {
  bg: '#0d1220', panel: '#131a2b', panelBorder: '#1e2940',
  text: '#e6ecf5', inkDim: '#8a97ad', inkFaint: '#5a6b85',
  green: '#10b981', amber: '#f59e0b', red: '#ef4444', sky: '#38bdf8',
};

// ── 3D Components ───────────────────────────────────────────────────────────

function Room({ room }: { room: typeof ROOMS[0] }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const [hover, setHover] = useState(false);
  const color = hover ? room.color : `${room.color}88`;

  return (
    <group position={[room.pos[0], 0, room.pos[1]]}>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[room.w - 0.3, room.d - 0.3]} />
        <meshStandardMaterial color={color} transparent opacity={0.3} />
      </mesh>
      {/* Walls */}
      <mesh position={[0, 0.5, 0]} ref={meshRef}
        onPointerOver={() => setHover(true)} onPointerOut={() => setHover(false)}>
        <boxGeometry args={[room.w - 0.2, 1, room.d - 0.2]} />
        <meshStandardMaterial color={color} transparent opacity={0.15} wireframe />
      </mesh>
      {/* Label */}
      <Text position={[0, 0.7, 0]} fontSize={0.25} color={room.color} anchorX="center" anchorY="middle"
        font={undefined} outlineWidth={0.02} outlineColor="#000">
        {room.label}
      </Text>
      {/* Characters — simple spheres */}
      {[...Array(3)].map((_, i) => (
        <mesh key={i} position={[(i - 1) * 0.6, 0.15, 0.4]}>
          <sphereGeometry args={[0.12, 8, 8]} />
          <meshStandardMaterial color={room.color} />
        </mesh>
      ))}
    </group>
  );
}

function OfficeScene({ onRoomClick }: { onRoomClick: (roomId: string) => void }) {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(8, 7, 12);
    camera.lookAt(3, 0, 5);
  }, [camera]);

  useFrame(() => {
    // subtle auto-rotate when idle (very slow)
  });

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 15, 10]} intensity={0.6} />
      {/* Grid floor */}
      <gridHelper args={[16, 16, '#1e2940', '#0d1220']} position={[3, -0.01, 5]} />
      {ROOMS.map(room => (
        <group key={room.id} onClick={() => onRoomClick(room.id)}>
          <Room room={room} />
        </group>
      ))}
      <OrbitControls
        target={[3, 0, 5]}
        enableDamping dampingFactor={0.1}
        maxPolarAngle={Math.PI / 2.5}
        minDistance={4} maxDistance={20}
      />
    </>
  );
}

// ── Job Runs Panel ──────────────────────────────────────────────────────────

function JobRuns({ jobs }: { jobs: JobRunView[] }) {
  const fmtTime = (iso: string | null) => {
    if (!iso) return '—';
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    return m < 1 ? 'now' : m < 60 ? `${m}m` : `${Math.round(m / 60)}h`;
  };

  return (
    <div style={{ background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 10, padding: 12, minWidth: 200 }}>
      <h4 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: INK.inkDim }}>งานระบบล่าสุด</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
        {jobs.slice(0, 8).map(j => (
          <div key={j.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, gap: 12 }}>
            <span style={{ color: INK.text }}>{j.job_name}</span>
            <span style={{ color: j.status === 'running' ? INK.amber : j.status === 'finished' ? INK.green : INK.inkFaint }}>
              {j.status} {fmtTime(j.finished_at)}
            </span>
          </div>
        ))}
        {!jobs.length && <span style={{ color: INK.inkFaint, fontSize: 11 }}>—</span>}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export function OfficeDashboard() {
  const [jobs, setJobs] = useState<JobRunView[]>([]);
  const [running, setRunning] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const data = await getJobStatus();
      setJobs(data.recent_runs || []);
      setRunning(data.running);
    } catch { /* office 3D still works without job data */ }
  }, []);

  useEffect(() => { fetchJobs(); const i = setInterval(fetchJobs, 30000); return () => clearInterval(i); }, [fetchJobs]);

  const room = ROOMS.find(r => r.id === selectedRoom);

  return (
    <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 180px)', minHeight: 500 }}>
      {/* 3D Canvas */}
      <Canvas style={{ background: INK.bg }} gl={{ antialias: true }}>
        <OfficeScene onRoomClick={setSelectedRoom} />
      </Canvas>

      {/* Overlay panels */}
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Status badge */}
        <div style={{
          background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 10, padding: '8px 14px',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: running ? INK.green : INK.inkFaint,
            animation: running ? 'pulse 2s infinite' : 'none' }} />
          <span style={{ fontSize: 11, color: INK.inkDim }}>{running ? 'ระบบกำลังทำงาน' : 'ระบบว่าง'}</span>
        </div>
        <JobRuns jobs={jobs} />
      </div>

      {/* Selected room card */}
      {room && (
        <div style={{
          position: 'absolute', bottom: 16, left: 16,
          background: INK.panel, border: `1px solid ${room.color}66`, borderRadius: 12, padding: 14,
          minWidth: 200, maxWidth: 260,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: room.color }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: INK.text }}>{room.label}</span>
            <button onClick={() => setSelectedRoom(null)}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: INK.inkFaint, cursor: 'pointer', fontSize: 14 }}>
              ✕
            </button>
          </div>
          <div style={{ fontSize: 11, color: INK.inkDim }}>
            {room.id === 'boardroom' && 'สัญญาณล่าสุด: 15 · สถานะ: ว่าง'}
            {room.id === 'trade_deepseek' && 'ทีม DeepSeek · สถานะ: ทำงาน · เทิร์นวันนี้: 3'}
            {room.id === 'models' && 'โมเดลทำงาน: 2 · กำลังก่อตัว: 2 · ไม่ทำงาน: 2'}
            {room.id === 'news' && 'ข่าวล่าสุด: CPI สหรัฐคืนนี้ · อัปเดต: 5m'}
            {room.id === 'cme' && 'FedWatch: 52% ขึ้น · Gold OI: 371K'}
            {!['boardroom', 'trade_deepseek', 'models', 'news', 'cme'].includes(room.id) &&
              `แผนก ${room.label} — ทำงานปกติ`}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div style={{ position: 'absolute', bottom: 12, right: 12, fontSize: 10, color: INK.inkFaint }}>
        🖱️ ลาก=หมุน · สกรอลล์=ซูม · คลิกแผนก=ข้อมูล
      </div>

      {/* Pulse animation */}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}
