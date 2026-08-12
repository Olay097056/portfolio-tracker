"""Test: directive + mandate must actually reach the LLM (ticket 07).

The trap this guards: adding a line to _build_base_context does not mean
the AI sees it. We stub llm_call and assert on the arguments passed.
"""

from unittest.mock import patch

from app.trade_desk_service import (
    TradeTeam, run_turn, _DEFAULT_TREND_PROMPT,
)


def _fake_llm(system_prompt: str, user_prompt: str, **kwargs):
    # Return a canned analyst-style JSON opinion, then lead decision.
    return ('{"action": "hold", "side": null, "market": null, "rationale": "test"}', {}, 0.1)


def _make_team(db, directive=None, mandate=None):
    team = TradeTeam(
        code="DEEPSEEK", name_th="Dir Test", name_en="Dir Test",
        capital=10000.0, balance=10000.0, equity=10000.0,
        team_directive=directive, mandate=mandate,
    )
    db.add(team)
    db.commit()
    db.refresh(team)
    return team


class TestDirectiveReachesLLM:
    def test_directive_in_lead_prompt(self, db_session):
        """Directive text must appear in the user_prompt sent to llm_call."""
        team = _make_team(db_session, directive="งดเทรดตอนข่าว FOMC โดยเด็ดขาด")

        captured = {}

        def spy_llm(system_prompt, user_prompt, **kwargs):
            captured["user_prompt"] = user_prompt
            return _fake_llm(system_prompt, user_prompt, **kwargs)

        with patch("app.trade_desk_service.llm_call", side_effect=spy_llm):
            run_turn(db_session, team, trigger="manual", agenda="test agenda")

        assert captured["user_prompt"] is not None
        # directive must be in the context sent to the lead
        assert "งดเทรดตอนข่าว FOMC" in captured["user_prompt"]

    def test_mandate_in_lead_prompt(self, db_session):
        """Mandate text must also reach the LLM."""
        team = _make_team(db_session, mandate="ลู่ทีม: เน้นเทรดทองคำช่วงข่าว FOMC")

        captured = {}

        def spy_llm(system_prompt, user_prompt, **kwargs):
            captured["user_prompt"] = user_prompt
            return _fake_llm(system_prompt, user_prompt, **kwargs)

        with patch("app.trade_desk_service.llm_call", side_effect=spy_llm):
            run_turn(db_session, team, trigger="manual", agenda="test agenda")

        assert "ลู่ทีม: เน้นเทรดทองคำ" in captured["user_prompt"]

    def test_no_directive_means_no_directive_section(self, db_session):
        """No directive set → context must not contain a fake empty section."""
        team = _make_team(db_session, directive=None, mandate=None)

        captured = {}

        def spy_llm(system_prompt, user_prompt, **kwargs):
            captured["user_prompt"] = user_prompt
            return _fake_llm(system_prompt, user_prompt, **kwargs)

        with patch("app.trade_desk_service.llm_call", side_effect=spy_llm):
            run_turn(db_session, team, trigger="manual", agenda="test agenda")

        assert "คำสั่งโต๊ะกลาง" not in captured["user_prompt"]
