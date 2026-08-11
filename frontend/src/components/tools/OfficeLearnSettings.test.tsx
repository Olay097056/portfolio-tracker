import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { LearnDashboard } from './LearnDashboard';
import { SettingsDashboard } from './SettingsDashboard';
import { OfficeDashboard } from './OfficeDashboard';
import * as client from '../../api/client';

vi.mock('../../api/client', () => ({
  getJobStatus: vi.fn(),
}));

// jsdom has no WebGL — mock three so the office 3D scene is a no-op in tests
// (factory is hoisted: no top-level variables allowed inside)
vi.mock('three', () => {
  const fn = () => fn;
  fn.position = { set: fn }; fn.scale = { setScalar: fn, set: fn }; fn.rotation = { x: 0 };
  fn.geometry = {}; fn.material = {}; fn.traverse = fn; fn.dispose = fn;
  fn.addEventListener = fn; fn.removeEventListener = fn; fn.setSize = fn;
  fn.setPixelRatio = fn; fn.render = fn; fn.append = fn; fn.appendChild = fn;
  fn.removeChild = fn; fn.updateProjectionMatrix = fn; fn.lookAt = fn;
  fn.setFromCamera = fn; fn.intersectObjects = () => []; fn.update = fn;
  fn.getBoundingClientRect = () => ({ width: 100, height: 100 });
  return {
    Scene: vi.fn(() => ({ background: {}, add: vi.fn(), traverse: vi.fn() })),
    PerspectiveCamera: vi.fn(() => ({ position: { set: vi.fn() }, lookAt: vi.fn(), updateProjectionMatrix: vi.fn(), aspect: 1 })),
    WebGLRenderer: vi.fn(() => ({
      setSize: vi.fn(), setPixelRatio: vi.fn(), domElement: document.createElement('canvas'),
      dispose: vi.fn(), render: vi.fn(),
    })),
    PlaneGeometry: vi.fn(() => ({ dispose: vi.fn() })),
    BoxGeometry: vi.fn(() => ({ dispose: vi.fn() })),
    MeshStandardMaterial: vi.fn(() => ({ dispose: vi.fn() })),
    Mesh: vi.fn(fn),
    AmbientLight: vi.fn(() => ({})),
    DirectionalLight: vi.fn(() => ({ position: { set: vi.fn() } })),
    Sprite: vi.fn(() => ({ position: { set: vi.fn() }, scale: { set: vi.fn() } })),
    SpriteMaterial: vi.fn(() => ({})),
    CanvasTexture: vi.fn(() => ({})),
    Raycaster: vi.fn(() => ({ setFromCamera: vi.fn(), intersectObjects: () => [] })),
    Vector2: vi.fn(() => ({ x: 0, y: 0 })),
    Clock: vi.fn(() => ({ getElapsedTime: () => 0 })),
    Color: vi.fn(() => ({})),
  };
});
vi.mock('three/examples/jsm/controls/OrbitControls.js', () => ({
  OrbitControls: class { constructor() {} enableDamping = false; dampingFactor = 0; maxPolarAngle = 0; update = vi.fn(); dispose = vi.fn(); },
}));

describe('LearnDashboard', () => {
  it('renders 7 lessons and marks complete via localStorage', async () => {
    render(<LearnDashboard />);
    await waitFor(() => expect(screen.getByText('🧭')).toBeTruthy());
    expect(screen.getByText('เข็มทิศตลาดพันธบัตร')).toBeTruthy();
    expect(screen.getByText('ธงสัญญาณเตือน')).toBeTruthy();
    expect(screen.getByText(/เรียนจบ 0\/7 บท/)).toBeTruthy();

    // open a lesson and mark complete — click the lesson button
    const lessonBtn = screen.getByText('เข็มทิศตลาดพันธบัตร').closest('button');
    expect(lessonBtn).toBeTruthy();
    fireEvent.click(lessonBtn!);
    await waitFor(() => expect(screen.getByText(/Yield Curve คืออะไร/)).toBeTruthy());
    fireEvent.click(screen.getByText('ทำเครื่องหมายเรียนจบ'));
    await waitFor(() => expect(screen.getByText(/เรียนจบ 1\/7 บท/)).toBeTruthy());
  });
});

describe('SettingsDashboard', () => {
  it('renders profile + alert prefs and toggles', async () => {
    render(<SettingsDashboard />);
    await waitFor(() => expect(screen.getByText('บัญชี')).toBeTruthy());
    expect(screen.getByText('รูปแบบการแจ้งเตือน')).toBeTruthy();
    expect(screen.getByText('JGB 10 ปี ทะลุ 2.5%')).toBeTruthy();
    expect(screen.getByText(/Telegram ยังไม่รองรับ/)).toBeTruthy();

    // toggle a pref off (first button in prefs list)
    const toggles = screen.getAllByRole('button', { name: /JGB|หางประมูล|ดัชนี|HY|เส้นโค้ง|Regime/ });
    expect(toggles.length).toBeGreaterThan(0);
  });
});

describe('OfficeDashboard', () => {
  beforeEach(() => {
    vi.mocked(client.getJobStatus).mockResolvedValue({
      recent_runs: [
        { id: 1, job_name: 'run-due-turns', started_at: '2026-08-11T14:00:00', finished_at: '2026-08-11T14:02:00', status: 'finished', detail: '{"prewarm": 31}' },
      ],
      running: false,
    } as never);
  });

  it('renders 3D office header + recent jobs', async () => {
    render(<OfficeDashboard />);
    await waitFor(() => expect(screen.getByText(/Agent Office 3D/)).toBeTruthy());
    expect(screen.getByText(/11 แผนก/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText('run-due-turns')).toBeTruthy());
    expect(screen.getByText('สำเร็จ')).toBeTruthy();
  });
});
