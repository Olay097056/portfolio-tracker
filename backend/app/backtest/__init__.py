# backend/app/backtest/__init__.py
"""Backtest engine for the AI Technical Signal upgrade (wayfinder ticket 06).

Validates the confidence-score pillar weights and ATR-based trading-setup
multipliers hardcoded in frontend/src/utils/aiTechnicalSignal.ts against real
historical price outcomes, per the methodology in
.scratch/ai-signal-upgrade/issues/03-backtest-methodology.md.

This package is a standalone analysis tool (run via `run.py`), not a live API
route — nothing in `app.routers` imports it.
"""
