"""Amazon Bedrock Converse API integration for personalized budgeting, savings, and financial literacy."""

from __future__ import annotations

import json
import logging
import os
import re
import urllib.error
import urllib.request
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

logger = logging.getLogger(__name__)


def _load_env() -> None:
    if "GEMINI_API_KEY" in os.environ and os.environ["GEMINI_API_KEY"].strip():
        return
    candidates = [
        os.path.join(os.getcwd(), ".env"),
        os.path.join(os.path.dirname(__file__), "..", "..", ".env"),
        os.path.expanduser("~/.env"),
    ]
    for c in candidates:
        if os.path.isfile(c):
            try:
                with open(c, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            k = k.strip()
                            v = v.strip().strip('"').strip("'")
                            if k not in os.environ:
                                os.environ[k] = v
            except Exception:
                pass


def _get_gemini_api_key() -> str | None:
    _load_env()
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    return key or None


def _call_gemini_api(
    system_prompt: str,
    contents: list[dict[str, Any]],
    response_json: bool = False,
    temperature: float = 0.4,
) -> tuple[str, str] | None:
    key = _get_gemini_api_key()
    if not key:
        return None

    model_candidates = [
        ("gemini-2.5-flash", True),
        ("gemini-flash-lite-latest", False),
        ("gemini-flash-latest", False),
    ]

    for model_name, disable_thinking in model_candidates:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={key}"
        gen_cfg: dict[str, Any] = {
            "temperature": temperature,
            "maxOutputTokens": 4096,
        }
        if response_json:
            gen_cfg["responseMimeType"] = "application/json"
        if disable_thinking:
            gen_cfg["thinkingConfig"] = {"thinkingBudget": 0}

        payload: dict[str, Any] = {
            "contents": contents,
            "systemInstruction": {
                "parts": [{"text": system_prompt}]
            },
            "generationConfig": gen_cfg,
        }

        try:
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=12) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                candidates = data.get("candidates") or []
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts") or []
                    if parts and "text" in parts[0]:
                        return str(parts[0]["text"]), model_name
        except Exception as exc:
            logger.warning("Gemini API call failed for %s: %s", model_name, exc)
            continue
    return None


def _get_model_candidates() -> list[str]:
    primary = os.environ.get("BEDROCK_MODEL_ID", "us.amazon.nova-pro-v1:0").strip()
    candidates = [
        primary,
        "us.amazon.nova-pro-v1:0",
        "us.amazon.nova-lite-v1:0",
        "amazon.nova-lite-v1:0",
    ]
    seen: set[str] = set()
    ordered: list[str] = []
    for m in candidates:
        if m and m not in seen:
            seen.add(m)
            ordered.append(m)
    return ordered


def _bedrock_client():
    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-east-1"
    return boto3.client(
        "bedrock-runtime",
        region_name=region,
        config=Config(retries={"max_attempts": 5, "mode": "adaptive"}, read_timeout=30),
    )


def _extract_json_block(text: str) -> dict[str, Any] | None:
    cleaned = text.strip()
    fence_match = re.search(r"```(?:json)?\s*(\{.*\})\s*```", cleaned, flags=re.DOTALL)
    if fence_match:
        cleaned = fence_match.group(1)
    else:
        brace_match = re.search(r"(\{.*\})", cleaned, flags=re.DOTALL)
        if brace_match:
            cleaned = brace_match.group(1)
    try:
        parsed = json.loads(cleaned)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None


def _build_deterministic_fallback_strategy(analytics: dict[str, Any]) -> dict[str, Any]:
    """Structured fallback when Bedrock credentials are unavailable locally."""
    cur = analytics.get("currency", "INR")
    summary = analytics.get("summary", {})
    ratios = analytics.get("ratios", {})
    health = analytics.get("health_score", {})
    cuts = analytics.get("cut_opportunities", [])
    debt_sim = analytics.get("debt_simulation", {})
    trends = analytics.get("historical_trends", {}).get("mom", {})
    goal = analytics.get("goal_analysis", {})

    surplus = summary.get("net_surplus", 0)
    runway = summary.get("emergency_runway_months", 0)
    debt_bal = summary.get("total_debt_balance", 0)
    top_cut = cuts[0] if cuts else None

    mom_note = ""
    if trends.get("has_prior"):
        delta = trends.get("health_score_delta", 0)
        sign = "+" if delta >= 0 else ""
        mom_note = (
            f" Compared to {trends.get('previous_month')}, your Health Score shifted by {sign}{delta} points "
            f"and your monthly savings changed by {trends.get('savings_delta', 0)} {cur}."
        )

    cut_text = (
        f"Trim {top_cut['category'].replace('_', ' ')} by 25% to free {top_cut['suggested_25pct_cut']} {cur}/month."
        if top_cut
        else "Audit discretionary wants to maintain at least a 20% savings rate."
    )

    literacy_cards = [
        {
            "concept": "The 50 / 30 / 20 Cashflow Rule",
            "relevance": f"Your split is {ratios.get('needs_pct', 0)}% Needs / {ratios.get('wants_pct', 0)}% Wants / {ratios.get('savings_pct', 0)}% Savings.",
            "explanation": "Aim to keep essential living expenses at or below 50% of take-home pay, lifestyle wants near 30%, and at least 20% flowing into savings or high-APR debt payoff.",
            "formula_example": f"Target Savings = 20% of {summary.get('total_income', 0)} {cur} = {round(summary.get('total_income', 0) * 0.2, 2)} {cur}/mo",
        },
        {
            "concept": "Emergency Runway Ratio",
            "relevance": f"Your liquid reserves currently cover {runway} months of essential needs.",
            "explanation": "An emergency buffer prevents unexpected medical, job, or repair costs from landing on high-interest credit cards. Build 1 month first, then scale to 4-6 months in a high-yield liquid fund.",
            "formula_example": f"Runway = {summary.get('current_savings', 0)} {cur} / {summary.get('total_needs', 0)} {cur} = {runway} months",
        },
    ]

    if debt_bal > 0:
        literacy_cards.append(
            {
                "concept": "Debt Avalanche vs. Snowball",
                "relevance": f"With {debt_bal} {cur} in debt, Avalanche saves {debt_sim.get('interest_saved_avalanche', 0)} {cur} in interest.",
                "explanation": "Avalanche puts every extra rupee toward the highest-APR debt first (mathematically cheapest), while Snowball clears the smallest balance first for fast psychological wins.",
                "formula_example": f"Extra {debt_sim.get('extra_monthly_applied', 0)} {cur}/mo cuts payoff by {debt_sim.get('months_saved_avalanche', 0)} months",
            }
        )
    else:
        literacy_cards.append(
            {
                "concept": "Pay-Yourself-First Compounding",
                "relevance": f"You are building toward {goal.get('goal_name', 'your goal')}.",
                "explanation": "Automating transfers on salary day turns saving from a leftover afterthought into a fixed habit, letting compound interest multiply idle cash over 3-5 years.",
                "formula_example": f"Saving {summary.get('effective_monthly_savings', 0)} {cur}/mo compounds steadily each year",
            }
        )

    return {
        "mode": "deterministic-fallback",
        "model_id": "offline-analytics-fallback",
        "executive_diagnosis": (
            f"Your Financial Health Score is {health.get('overall', 0)}/100 ({health.get('tier', 'Stable')}) "
            f"with a monthly net cashflow of {surplus} {cur} and {runway} months of emergency runway.{mom_note}"
        ),
        "history_reflection": (
            mom_note.strip()
            if mom_note
            else "First month baseline recorded. Upload next month's bank CSV or update the portal ledger to unlock Month-over-Month accountability tracking."
        ),
        "budgeting_suggestions": [
            cut_text,
            f"Keep essential Needs near 50% ({analytics.get('recommended_50_30_20', {}).get('needs_target', 0)} {cur}) and automate savings on payday.",
            "Review recurring subscriptions monthly and cancel services unused in the last 30 days.",
        ],
        "savings_strategy": (
            f"Route positive surplus toward a starter 1-month emergency buffer first, then attack high-APR debt "
            f"before scaling long-term SIP/index investments toward {goal.get('goal_name', 'your goal')}."
        ),
        "action_plan_30_60_90": [
            {
                "window": "Days 1-30",
                "action": cut_text,
                "impact": "Immediate monthly cashflow boost",
            },
            {
                "window": "Days 31-60",
                "action": f"Automate {round(summary.get('total_income', 0) * 0.2, 2)} {cur}/month on salary credit into savings or debt payoff.",
                "impact": "Locks in 20%+ savings discipline",
            },
            {
                "window": "Days 61-90",
                "action": "Re-upload bank CSV or update portal ledger to verify Health Score gain.",
                "impact": "Sustained multi-month accountability",
            },
        ],
        "literacy_cards": literacy_cards,
        "disclaimer": "Educational financial guidance only, not licensed investment or tax advice.",
    }


def _compact_transactions(ledger_items: list[dict[str, Any]] | None, limit: int = 50) -> list[dict[str, Any]]:
    if not ledger_items:
        return []
    return [
        {
            "date": it.get("date"),
            "name": it.get("name"),
            "category": it.get("category"),
            "bucket": it.get("bucket"),
            "amount": it.get("amount"),
            "tx_type": it.get("tx_type"),
            "source": it.get("source"),
            "recurring": bool(it.get("recurring", False)),
        }
        for it in ledger_items[:limit]
    ]


def _compact_files(uploaded_files: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    if not uploaded_files:
        return []
    return [
        {
            "filename": uf.get("filename"),
            "file_type": uf.get("file_type"),
            "months_covered": uf.get("months_covered"),
            "row_count": uf.get("row_count"),
            "total_expense": uf.get("total_expense"),
            "total_income": uf.get("total_income"),
        }
        for uf in uploaded_files[:10]
    ]


def generate_financial_strategy(
    analytics: dict[str, Any],
    user_id: str,
    ledger_items: list[dict[str, Any]] | None = None,
    uploaded_files: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Invoke Gemini or Amazon Bedrock with verified calculated analytics AND uploaded transactions."""
    compact_context = {
        "user": user_id,
        "month": analytics.get("month"),
        "currency": analytics.get("currency", "INR"),
        "source_breakdown": analytics.get("source_breakdown"),
        "summary": analytics.get("summary"),
        "ratios": analytics.get("ratios"),
        "health_score": analytics.get("health_score"),
        "recommended_50_30_20": analytics.get("recommended_50_30_20"),
        "top_categories": (analytics.get("category_breakdown") or [])[:8],
        "alerts": analytics.get("alerts"),
        "cut_opportunities": analytics.get("cut_opportunities"),
        "goal_analysis": analytics.get("goal_analysis"),
        "debt_summary": {
            "extra_monthly_applied": analytics.get("debt_simulation", {}).get("extra_monthly_applied"),
            "baseline_months": analytics.get("debt_simulation", {}).get("baseline", {}).get("months"),
            "avalanche_months": analytics.get("debt_simulation", {}).get("avalanche", {}).get("months"),
            "interest_saved_avalanche": analytics.get("debt_simulation", {}).get("interest_saved_avalanche"),
        },
        "historical_trends": analytics.get("historical_trends"),
        "uploaded_files": _compact_files(uploaded_files),
        "uploaded_transactions": _compact_transactions(ledger_items, limit=45),
    }

    system_prompt = (
        "You are FinWise AI, an empathetic, practical Personal Financial Literacy and Budgeting Coach. "
        "You receive exact, pre-computed financial analytics and multi-month historical trends in JSON. "
        "NEVER invent or recalculate conflicting math; cite the provided numbers accurately. "
        "Always use the user's currency code cleanly (e.g. INR Rs/INR). "
        "If historical_trends.mom.has_prior is true, explicitly acknowledge progress or regressions from the previous month "
        "and check in on prior_commitments. "
        "Return ONLY valid JSON matching this exact schema:\n"
        "{\n"
        '  "executive_diagnosis": "2-3 sentence summary grounded in their exact numbers",\n'
        '  "history_reflection": "1-2 sentence reflection comparing with prior month or noting baseline recorded",\n'
        '  "budgeting_suggestions": ["3-4 concrete, numbered-amount suggestions"],\n'
        '  "savings_strategy": "2-3 sentence tailored savings & debt priority strategy",\n'
        '  "action_plan_30_60_90": [\n'
        '    {"window": "Days 1-30", "action": "...", "impact": "..."},\n'
        '    {"window": "Days 31-60", "action": "...", "impact": "..."},\n'
        '    {"window": "Days 61-90", "action": "...", "impact": "..."}\n'
        "  ],\n"
        '  "literacy_cards": [\n'
        '    {"concept": "...", "relevance": "why it applies to their numbers", "explanation": "jargon-free explanation", "formula_example": "using their numbers"}\n'
        "  ]\n"
        "}"
    )

    user_message = (
        "Analyze this verified financial analytics snapshot and historical trend context, "
        "and generate a personalized strategy plus 3 contextual financial literacy cards:\n"
        f"{json.dumps(compact_context, indent=2)}"
    )

    # 1. Try Google Gemini first if GEMINI_API_KEY is available
    gemini_result = _call_gemini_api(
        system_prompt=system_prompt,
        contents=[{"role": "user", "parts": [{"text": user_message}]}],
        response_json=True,
        temperature=0.35,
    )
    if gemini_result is not None:
        raw_text, model_name = gemini_result
        parsed = _extract_json_block(raw_text)
        if parsed and "executive_diagnosis" in parsed:
            parsed["mode"] = "google-gemini"
            parsed["model_id"] = model_name
            parsed["disclaimer"] = "Educational financial guidance only, not licensed investment or tax advice."
            return parsed

    try:
        client = _bedrock_client()
    except (ClientError, BotoCoreError, Exception) as exc:
        fallback = _build_deterministic_fallback_strategy(analytics)
        fallback["fallback_reason"] = str(exc)[:180]
        return fallback

    last_error: str | None = None

    for model_id in _get_model_candidates():
        try:
            response = client.converse(
                modelId=model_id,
                system=[{"text": system_prompt}],
                messages=[{"role": "user", "content": [{"text": user_message}]}],
                inferenceConfig={"maxTokens": 1800, "temperature": 0.35},
            )
            raw_text = response["output"]["message"]["content"][0]["text"]
            parsed = _extract_json_block(raw_text)
            if parsed and "executive_diagnosis" in parsed:
                parsed["mode"] = "amazon-bedrock"
                parsed["model_id"] = model_id
                parsed["disclaimer"] = "Educational financial guidance only, not licensed investment or tax advice."
                return parsed
            last_error = "Model returned non-JSON response"
        except (ClientError, BotoCoreError, KeyError, IndexError) as exc:
            last_error = str(exc)
            logger.warning("Bedrock call failed for %s: %s", model_id, exc)
            continue

    fallback = _build_deterministic_fallback_strategy(analytics)
    if last_error:
        fallback["fallback_reason"] = last_error[:180]
    return fallback


def _fmt_amt(amount: float, currency: str) -> str:
    val = round(float(amount or 0))
    prefix = "Rs " if currency == "INR" else ("$ " if currency == "USD" else "EUR ")
    return f"{prefix}{val:,}"


def _build_offline_chat_reply(question: str, analytics: dict[str, Any]) -> str:
    q = question.lower()
    cur = analytics.get("currency", "INR")
    summary = analytics.get("summary", {})
    ratios = analytics.get("ratios", {})
    health = analytics.get("health_score", {})
    cats = analytics.get("category_breakdown") or []
    cuts = analytics.get("cut_opportunities") or []
    mom = (analytics.get("historical_trends") or {}).get("mom") or {}
    goal = analytics.get("goal_analysis") or {}
    debt_sim = analytics.get("debt_simulation") or {}

    income = summary.get("total_income", 0)
    spent = summary.get("total_needs", 0) + summary.get("total_wants", 0)
    saved = summary.get("effective_monthly_savings", 0)
    surplus = summary.get("net_surplus", 0)
    runway = summary.get("emergency_runway_months", 0)
    debt = summary.get("total_debt_balance", 0)
    month = analytics.get("month", "this month")

    top_cat = cats[0] if cats else None
    top_cut = cuts[0] if cuts else None

    if "last month" in q or "compare" in q or "history" in q or "previous" in q:
        if mom.get("has_prior"):
            prev_m = mom.get("previous_month")
            s_delta = mom.get("savings_delta", 0)
            w_delta = mom.get("wants_delta", 0)
            h_delta = mom.get("health_score_delta", 0)
            return (
                f"Comparing {month} against {prev_m}:\n"
                f"- Financial Health Score: {health.get('overall', 0)}/100 ({'+' if h_delta >= 0 else ''}{h_delta} pts)\n"
                f"- Monthly Savings: {_fmt_amt(saved, cur)} ({'+' if s_delta >= 0 else ''}{_fmt_amt(s_delta, cur)} vs {prev_m})\n"
                f"- Discretionary Wants: {'down' if w_delta <= 0 else 'up'} by {_fmt_amt(abs(w_delta), cur)}\n"
                + (
                    f"Top saving win: Keep trimming {top_cut['category'].replace('_', ' ')} by 25% to add another {_fmt_amt(top_cut['suggested_25pct_cut'], cur)}/month."
                    if top_cut
                    else "Great momentum maintaining steady cashflow across months."
                )
            )
        return (
            f"In {month}, you saved {_fmt_amt(saved, cur)} ({ratios.get('savings_pct', 0)}% of income). "
            "Upload or select another month to unlock side-by-side Month-over-Month comparisons."
        )

    if "emergency" in q or "runway" in q:
        target = summary.get("recommended_emergency_fund", 0)
        gap = max(0, target - summary.get("current_savings", 0))
        return (
            f"Your current liquid savings of {_fmt_amt(summary.get('current_savings', 0), cur)} cover {runway} months of essential needs.\n"
            f"- Recommended 4-month target: {_fmt_amt(target, cur)} (remaining gap: {_fmt_amt(gap, cur)}).\n"
            + (
                f"- Quickest boost: Trimming {top_cut['category'].replace('_', ' ')} by 25% frees {_fmt_amt(top_cut['suggested_25pct_cut'], cur)}/mo directly into a liquid emergency fund."
                if top_cut
                else "- Automate a fixed transfer on payday into a separate high-yield savings or liquid fund."
            )
        )

    if "reduce" in q or "cut" in q or "save" in q and "how" in q:
        lines = [f"Top ways to unlock monthly savings from your {month} budget:"]
        for c in cuts[:3]:
            lines.append(
                f"- Reduce {c['category'].replace('_', ' ').title()} by 25% ({_fmt_amt(c['current_monthly'], cur)} -> {_fmt_amt(c['current_monthly'] - c['suggested_25pct_cut'], cur)}) to save {_fmt_amt(c['suggested_25pct_cut'], cur)}/mo ({_fmt_amt(c['annual_savings'], cur)}/yr)."
            )
        if len(lines) == 1:
            lines.append(
                f"- Aim for the 50/30/20 split: target {_fmt_amt(income * 0.2, cur)}/mo in automated savings on salary day."
            )
        if debt > 0:
            lines.append(
                f"- Directing extra savings toward high-APR debt saves {_fmt_amt(debt_sim.get('interest_saved_avalanche', 0), cur)} in interest."
            )
        return "\n".join(lines)

    if "cash flow" in q or "cashflow" in q or "summarize" in q or "biggest" in q:
        top_text = (
            f"Your largest category is {top_cat['category'].replace('_', ' ').title()} at {_fmt_amt(top_cat['amount'], cur)} ({top_cat['pct_of_income']}% of income)."
            if top_cat
            else ""
        )
        return (
            f"Here is your {month} cash flow summary:\n"
            f"- Income: {_fmt_amt(income, cur)}\n"
            f"- Total Expenses: {_fmt_amt(spent, cur)} ({ratios.get('needs_pct', 0)}% Essentials, {ratios.get('wants_pct', 0)}% Wants)\n"
            f"- Effective Savings: {_fmt_amt(saved, cur)} ({ratios.get('savings_pct', 0)}% savings rate) | Net Surplus: {_fmt_amt(surplus, cur)}\n"
            f"{top_text}\n"
            f"Health Score: {health.get('overall', 0)}/100 ({health.get('tier', 'Stable')}). Goal '{goal.get('goal_name', '')}' is {goal.get('progress_pct', 0)}% funded."
        )

    if "debt" in q or "apr" in q or "sip" in q or "loan" in q:
        if debt > 0:
            return (
                f"You currently carry {_fmt_amt(debt, cur)} in debt with {_fmt_amt(summary.get('debt_min_payments', 0), cur)}/mo in minimum payments ({ratios.get('dti_pct', 0)}% DTI).\n"
                f"Using the Debt Avalanche method (highest APR first) clears your debt in {debt_sim.get('avalanche', {}).get('months', 0)} months and saves {_fmt_amt(debt_sim.get('interest_saved_avalanche', 0), cur)} in interest compared to minimums alone."
            )
        return "You have no active debt recorded, so every extra rupee saved can compound in your emergency buffer and long-term SIP investments."

    return (
        f"For {month}, your income is {_fmt_amt(income, cur)}, total spending is {_fmt_amt(spent, cur)}, and you are saving {_fmt_amt(saved, cur)} ({ratios.get('savings_pct', 0)}%).\n"
        + (
            f"Quickest win: trim {top_cut['category'].replace('_', ' ')} by 25% to save {_fmt_amt(top_cut['suggested_25pct_cut'], cur)}/month ({_fmt_amt(top_cut['annual_savings'], cur)}/year)."
            if top_cut
            else "Keeping essentials under 50% and automating 20% savings on payday keeps your Financial Health Score climbing."
        )
    )


def chat_with_coach(
    question: str,
    analytics: dict[str, Any],
    chat_history: list[dict[str, Any]],
    user_id: str,
    ledger_items: list[dict[str, Any]] | None = None,
    uploaded_files: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Answer user financial literacy or budgeting follow-up questions with calculated numbers AND uploaded rows."""
    compact_context = {
        "user": user_id,
        "month": analytics.get("month"),
        "currency": analytics.get("currency", "INR"),
        "summary": analytics.get("summary"),
        "ratios": analytics.get("ratios"),
        "health_score": analytics.get("health_score"),
        "recommended_50_30_20": analytics.get("recommended_50_30_20"),
        "top_categories": (analytics.get("category_breakdown") or [])[:8],
        "cut_opportunities": analytics.get("cut_opportunities"),
        "goal_analysis": analytics.get("goal_analysis"),
        "debt_simulation": {
            "avalanche_months": analytics.get("debt_simulation", {}).get("avalanche", {}).get("months"),
            "interest_saved": analytics.get("debt_simulation", {}).get("interest_saved_avalanche"),
        },
        "historical_trends": analytics.get("historical_trends"),
        "uploaded_files": _compact_files(uploaded_files),
        "uploaded_transactions": _compact_transactions(ledger_items, limit=60),
    }

    system_prompt = (
        "You are FinWise AI, an institutional-grade yet warm and easy-to-understand Personal Financial Strategist. "
        "You receive TWO verified inputs below: "
        "(1) Pre-calculated financial metrics, 50/30/20 ratios, Health Score, debt simulations, and MoM deltas; and "
        "(2) The user's real uploaded CSV, Excel, and Portal transactions. "
        "Reason over BOTH the calculated analytics and the specific uploaded items (cite exact merchant names, dates, and amounts when answering). "
        "Explain insights in simple, plain language that non-technical users can immediately act on, with zero jargon and zero emojis. "
        "Always include a brief one-line reminder that this is educational guidance, not licensed investment advice.\n\n"
        f"VERIFIED USER FINANCIAL DATA & CALCULATED METRICS:\n{json.dumps(compact_context)}"
    )

    # 1. Try Google Gemini first if GEMINI_API_KEY is available
    gemini_contents: list[dict[str, Any]] = []
    for turn in chat_history[-8:]:
        role = "model" if turn.get("role") == "assistant" else "user"
        text = str(turn.get("text") or "").strip()
        if text:
            gemini_contents.append({"role": role, "parts": [{"text": text}]})
    gemini_contents.append({"role": "user", "parts": [{"text": question}]})

    gemini_result = _call_gemini_api(
        system_prompt=system_prompt,
        contents=gemini_contents,
        response_json=False,
        temperature=0.4,
    )
    if gemini_result is not None:
        reply_text, model_name = gemini_result
        return {
            "reply": reply_text.strip(),
            "mode": "google-gemini",
            "model_id": model_name,
        }

    messages: list[dict[str, Any]] = []
    for turn in chat_history[-8:]:
        role = "assistant" if turn.get("role") == "assistant" else "user"
        text = str(turn.get("text") or "").strip()
        if not text:
            continue
        # Bedrock Converse requires alternating user/assistant messages starting with user
        if not messages and role != "user":
            continue
        if messages and messages[-1]["role"] == role:
            messages[-1]["content"].append({"text": text})
        else:
            messages.append({"role": role, "content": [{"text": text}]})

    if messages and messages[-1]["role"] == "user":
        messages[-1]["content"].append({"text": question})
    else:
        messages.append({"role": "user", "content": [{"text": question}]})

    try:
        client = _bedrock_client()
    except (ClientError, BotoCoreError, Exception) as exc:
        logger.warning("Bedrock client init failed: %s", exc)
        client = None

    if client is not None:
        for model_id in _get_model_candidates():
            try:
                response = client.converse(
                    modelId=model_id,
                    system=[{"text": system_prompt}],
                    messages=messages,
                    inferenceConfig={"maxTokens": 900, "temperature": 0.4},
                )
                reply = response["output"]["message"]["content"][0]["text"]
                return {"reply": reply, "mode": "amazon-bedrock", "model_id": model_id}
            except (ClientError, BotoCoreError, KeyError, IndexError) as exc:
                logger.warning("Bedrock chat failed for %s: %s", model_id, exc)
                continue

    return {
        "reply": _build_offline_chat_reply(question, analytics),
        "mode": "deterministic-fallback",
        "model_id": "offline-analytics-fallback",
    }
