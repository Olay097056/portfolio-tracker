import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getJobStatus } from '../../api/client';
import type { JobStatus } from '../../api/types';

// Agent Office 3D — หน้า /office ของ reference (ใบ 11): บริษัทจำลอง 3 มิติ
// 11 แผนก + งานระบบล่าสุด (จาก job_runs จริง) + สถานะ running
// Three.js (npm three) — กล้องหมุนได้ (OrbitControls), โฮเวอร์ดูชื่อแผนก

const INK = {
  panel: '#101623',
  panelBorder: '#1e2940',
  ink: '#e8eef7',
  inkDim: '#8b9bb4',
  inkFaint: '#5a6b85',
  accent: '#38bdf8',
  emerald: '#34d399',
  red: '#f87171',
  amber: '#f59e0b',
};

const DEPARTMENTS: { id: string; name: string; th: string; color: number; role: string }[] = [
  { id: 'trading-desk', name: 'โต๊ะเทรด', th: 'หัวหน้าโต๊ะเทรด', color: 0x38bdf8, role: 'deepseek' },
  { id: 'boardroom', name: 'ห้องประชุมบอร์ด', th: 'ประชุม AI', color: 0xa78bfa, role: 'deepseek' },
  { id: 'model-hub', name: 'ศูนย์โมเดล', th: '6 โมเดลทำกำไร', color: 0x34d399, role: 'deepseek' },
  { id: 'data-hub', name: 'ศูนย์ข้อมูล', th: 'FRED/CFTC/TIC', color: 0x34d399, role: 'deepseek' },
  { id: 'signal-hub', name: 'ศูนย์สัญญาณ', th: 'FedWatch/COT', color: 0x34d399, role: 'deepseek' },
  { id: 'news-room', name: 'ฝ่ายข่าว', th: 'RSS + AI วิเคราะห์', color: 0xf59e0b, role: 'deepseek' },
  { id: 'cme-quant', name: 'ควอนต์ CME', th: 'IV/ออปชัน', color: 0xf59e0b, role: 'deepseek' },
  { id: 'exchange', name: 'ตู้ Exchange', th: 'ราคาสด Hyperliquid', color: 0xf59e0b, role: 'deepseek' },
  { id: 'reception', name: 'ต้อนรับ', th: 'ภาพรวม', color: 0x94a3b8, role: 'deepseek' },
  { id: 'comms', name: 'ฝ่ายสื่อสาร', th: 'รายงาน', color: 0x94a3b8, role: 'deepseek' },
  { id: 'ai-accounting', name: 'บัญชี AI', th: 'ค่าใช้จ่าย LLM', color: 0x94a3b8, role: 'deepseek' },
];

const GRID_COLS = 4;

export function OfficeDashboard() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // --- 3D scene ---
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1220);
    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 0.1, 1000);
    camera.position.set(14, 10, 16);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2.2;

    // floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 20),
      new THREE.MeshStandardMaterial({ color: 0x1e2940, roughness: 0.9 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.6;
    scene.add(floor);

    // lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(10, 18, 8);
    scene.add(dir);

    // department boxes on a grid
    const boxes: THREE.Mesh[] = [];
    const hoverTargets: { mesh: THREE.Mesh; id: string }[] = [];
    DEPARTMENTS.forEach((dep, i) => {
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const x = (col - (GRID_COLS - 1) / 2) * 4.2;
      const z = (row - 1) * 4.2;
      const geo = new THREE.BoxGeometry(2.6, 1.8, 2.6);
      const mat = new THREE.MeshStandardMaterial({ color: dep.color, roughness: 0.4, metalness: 0.15 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, 0.3, z);
      scene.add(mesh);
      boxes.push(mesh);
      hoverTargets.push({ mesh, id: dep.id });

      // label sprite
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0d1220';
        ctx.fillRect(0, 0, 512, 128);
        ctx.fillStyle = '#e8eef7';
        ctx.font = 'bold 44px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(dep.name, 256, 72);
      }
      const tex = new THREE.CanvasTexture(canvas);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      sprite.position.set(x, 1.9, z);
      sprite.scale.set(3.4, 0.85, 1);
      scene.add(sprite);
    });

    // raycast hover
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onMove = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(boxes);
      const id = hit.length ? hoverTargets.find((t) => t.mesh === hit[0].object)?.id ?? null : null;
      setHovered((prev) => (prev === id ? prev : id));
    };
    renderer.domElement.addEventListener('pointermove', onMove);

    // pulse animation on the running desk
    const clock = new THREE.Clock();
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      if (jobStatus?.running && boxes.length) {
        boxes[0].scale.setScalar(1 + 0.06 * Math.sin(t * 3));
      }
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointermove', onMove);
      controls.dispose();
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- job status ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await getJobStatus();
        if (!cancelled) setJobStatus(d);
      } catch {
        if (!cancelled) setLoadError('โหลดสถานะงานระบบไม่สำเร็จ');
      }
    })();
    const iv = window.setInterval(async () => {
      try {
        const d = await getJobStatus();
        if (!cancelled) setJobStatus(d);
      } catch {
        /* keep last */
      }
    }, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
  }, []);

  const hoveredDep = DEPARTMENTS.find((d) => d.id === hovered);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── 3D viewport ── */}
      <div style={{
        background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 12,
        padding: 16, position: 'relative',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK.inkFaint }}>
            🏢 Agent Office 3D — {DEPARTMENTS.length} แผนก
          </div>
          <span style={{ fontSize: '0.68rem', color: INK.inkFaint }}>
            {jobStatus?.running ? (
              <span style={{ color: INK.emerald }}>● กำลังทำงาน</span>
            ) : (
              <span style={{ color: INK.inkFaint }}>○ ว่าง</span>
            )} · ลากหมุน · โฮเวอร์ดูแผนก
          </span>
        </div>
        <div ref={mountRef} style={{ width: '100%', height: 440, borderRadius: 8, overflow: 'hidden', position: 'relative' }} />
        {hoveredDep && (
          <div style={{
            position: 'absolute', top: 58, left: 20, background: INK.panel,
            border: `1px solid ${INK.panelBorder}`, borderRadius: 8, padding: '8px 12px',
            fontSize: '0.78rem', color: INK.ink, pointerEvents: 'none',
          }}>
            <b>{hoveredDep.name}</b> <span style={{ color: INK.inkDim }}>· {hoveredDep.th}</span>
          </div>
        )}
      </div>

      {/* ── งานระบบล่าสุด ── */}
      <div style={{
        background: INK.panel, border: `1px solid ${INK.panelBorder}`, borderRadius: 12, padding: 16,
      }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK.inkFaint, marginBottom: 10 }}>
          งานระบบล่าสุด
        </div>
        {loadError && <div style={{ color: INK.red, fontSize: '0.78rem' }}>{loadError}</div>}
        {!jobStatus && !loadError && <div style={{ color: INK.inkFaint, fontSize: '0.8rem' }}>กำลังโหลด…</div>}
        {jobStatus && jobStatus.recent_runs.length === 0 && (
          <div style={{ color: INK.inkFaint, fontSize: '0.8rem' }}>ยังไม่มีรอบทำงาน — pg_cron จะเริ่มภายใน 10 นาที</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {jobStatus?.recent_runs.map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.78rem' }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: r.status === 'finished' ? INK.emerald : r.status === 'failed' ? INK.red : INK.amber,
              }} />
              <span style={{ color: INK.ink, fontFamily: 'monospace' }}>{r.job_name}</span>
              <span style={{ color: INK.inkFaint }}>{r.started_at ? new Date(r.started_at).toLocaleString('th-TH', { hour12: false }) : ''}</span>
              <span style={{
                marginLeft: 'auto', padding: '2px 8px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 700,
                background: r.status === 'finished' ? 'rgba(52,211,153,0.15)' : r.status === 'failed' ? 'rgba(248,113,113,0.15)' : 'rgba(245,158,11,0.15)',
                color: r.status === 'finished' ? INK.emerald : r.status === 'failed' ? INK.red : INK.amber,
              }}>
                {r.status === 'finished' ? 'สำเร็จ' : r.status === 'failed' ? 'ล้มเหลว' : 'กำลังทำงาน'}
              </span>
              {r.detail && (
                <span style={{ color: INK.inkFaint, fontSize: '0.7rem', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {String(r.detail).slice(0, 80)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
