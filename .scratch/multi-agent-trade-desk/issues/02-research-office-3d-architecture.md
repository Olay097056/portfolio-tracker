# 02 — Research: Dig reference office 3D architecture

Type: research
Status: closed
Claimed: hermes/2026-08-11

## Answer

Deliverable: `docs/research/office-3d-reference-2026-08-11.md`

### Key findings:
- **13 หน่วย/แผนก**: boardroom (15 signals), model center (6), 9 trade desks (63 pos), lead desk (1), market data center (4), news (2), CME quant (2), country desk (2), reception+comms (3), AI accounting (1), signal center (3)
- **3D library**: React Three Fiber (`@react-three/fiber` module 67909) + OrbitControls
- **Character system**: board members (AI teams) + staff — `kind`, `dept`, `family`, `seatId`, `provider`, states (idle/in_meeting/speaking)
- **State model**: pipeline (job runs), teams (per-family), meeting (status + currentSeat)
- **Interaction**: left-drag=orbit, scroll=zoom, right-drag=pan, click=card, double-click=zoom-to, Esc=reset
- **UI overlay**: character cards, overview panel, news ticker, job run list, turn queue — all HTML over 3D canvas
- **Assets**: no external GLB URLs found — likely procedural geometry or embedded in shared chunks
