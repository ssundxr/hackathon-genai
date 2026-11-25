"""Deterministic personal financial analytics, scoring, debt payoff, MoM trends, and projections."""

from __future__ import annotations

from typing import Any


NEEDS_CATEGORIES = {
    "housing",
    "rent",
    "mortgage",
    "groceries",
    "utilities",
    "healthcare",
    "insurance",
    "transportation",
    "childcare",
    "education",
    "minimum_debt",
}

SAVINGS_CATEGORIES = {
    "savings",
    "emergency_fund",
    "investments",
    "sip",
    "retirement",
    "extra_debt_payment",
}


def _round2(value: float) -> float:
    return round(float(value), 2)


def _safe_pct(part: float, whole: float) -> float:
    if whole <= 0:
        return 0.0
    return round((part / whole) * 100.0, 1)


def simulate_debt_payoff(
    debts: list[dict[str, Any]],
    extra_monthly_payment: float = 0.0,
    strategy: str = "avalanche",
    max_months: int = 360,
) -> dict[str, Any]:
    """Simulate debt payoff under avalanche (highest APR first) or snowball (smallest balance first)."""
    normalized: list[dict[str, float | str]] = []
    for item in debts:
        balance = max(0.0, float(item.get("balance", 0) or 0))
        apr = max(0.0, float(item.get("apr", 0) or 0))
        min_payment = max(0.0, float(item.get("min_payment", 0) or 0))
        if balance > 0:
            normalized.append(
                {
                    "name": str(item.get("name") or "Debt"),
                    "balance": balance,
                    "apr": apr,
                    "min_payment": min_payment if min_payment > 0 else max(500.0, balance * 0.025),
                }
            )

    if not normalized:
        return {
            "strategy": strategy,
            "months": 0,
            "total_interest": 0.0,
            "total_paid": 0.0,
            "timeline": [],
            "payoff_order": [],
        }

    state = [dict(d) for d in normalized]
    months = 0
    total_interest = 0.0
    total_paid = 0.0
    payoff_order: list[dict[str, Any]] = []
    timeline: list[dict[str, Any]] = [
        {"month": 0, "remaining_balance": _round2(sum(float(d["balance"]) for d in state))}
    ]

    while any(float(d["balance"]) > 0.01 for d in state) and months < max_months:
        months += 1
        for d in state:
            bal = float(d["balance"])
            if bal > 0:
                monthly_rate = (float(d["apr"]) / 100.0) / 12.0
                interest = bal * monthly_rate
                d["balance"] = bal + interest
                total_interest += interest

        extra_pool = max(0.0, float(extra_monthly_payment))
        for d in state:
            bal = float(d["balance"])
            if bal <= 0:
                extra_pool += float(d["min_payment"])
                continue
            pay = min(bal, float(d["min_payment"]))
            d["balance"] = bal - pay
            total_paid += pay
            if float(d["balance"]) <= 0.01:
                d["balance"] = 0.0
                if not any(p["name"] == d["name"] for p in payoff_order):
                    payoff_order.append({"name": d["name"], "month": months})

        active = [d for d in state if float(d["balance"]) > 0.01]
        if strategy == "snowball":
            active.sort(key=lambda x: float(x["balance"]))
        else:
            active.sort(key=lambda x: float(x["apr"]), reverse=True)

        for d in active:
            if extra_pool <= 0.01:
                break
            bal = float(d["balance"])
            pay = min(bal, extra_pool)
            d["balance"] = bal - pay
            extra_pool -= pay
            total_paid += pay
            if float(d["balance"]) <= 0.01:
                d["balance"] = 0.0
                if not any(p["name"] == d["name"] for p in payoff_order):
                    payoff_order.append({"name": d["name"], "month": months})

        if months <= 24 or months % 3 == 0 or not any(float(d["balance"]) > 0.01 for d in state):
            timeline.append(
                {
                    "month": months,
                    "remaining_balance": _round2(sum(float(d["balance"]) for d in state)),
                }
            )

    return {
        "strategy": strategy,
        "months": months,
        "total_interest": _round2(total_interest),
        "total_paid": _round2(total_paid),
        "timeline": timeline[:36],
        "payoff_order": payoff_order,
    }


def project_savings(
    current_savings: float,
    monthly_contribution: float,
    annual_yield_pct: float = 7.0,
    years: int = 5,
) -> list[dict[str, Any]]:
    """Project compound savings growth sampled yearly."""
    balance = max(0.0, float(current_savings))
    contrib = max(0.0, float(monthly_contribution))
    monthly_rate = max(0.0, float(annual_yield_pct)) / 100.0 / 12.0
    total_contributed = balance

    points: list[dict[str, Any]] = [
        {
            "year": 0,
            "balance": _round2(balance),
            "contributed": _round2(total_contributed),
            "interest_earned": 0.0,
        }
    ]
    for year in range(1, years + 1):
        for _ in range(12):
            balance = balance * (1.0 + monthly_rate) + contrib
            total_contributed += contrib
        points.append(
            {
                "year": year,
                "balance": _round2(balance),
                "contributed": _round2(total_contributed),
                "interest_earned": _round2(balance - total_contributed),
            }
        )
    return points


def compute_historical_trends(
    current_month: str,
    current_analytics: dict[str, Any],
    prior_snapshots: list[dict[str, Any]],
) -> dict[str, Any]:
    """Compute Month-over-Month (MoM) deltas and longitudinal series from historical snapshots."""
    series: list[dict[str, Any]] = []
    prior_sorted = sorted(
        [s for s in prior_snapshots if s.get("month") and s.get("month") != current_month],
        key=lambda x: str(x["month"]),
    )

    for snap in prior_sorted:
        a = snap.get("analytics") or {}
        s = a.get("summary") or {}
        r = a.get("ratios") or {}
        h = a.get("health_score") or {}
        series.append(
            {
                "month": snap["month"],
                "income": _round2(s.get("total_income", 0)),
                "needs": _round2(s.get("total_needs", 0)),
                "wants": _round2(s.get("total_wants", 0)),
                "savings": _round2(s.get("effective_monthly_savings", 0)),
                "debt_balance": _round2(s.get("total_debt_balance", 0)),
                "savings_pct": r.get("savings_pct", 0),
                "health_score": h.get("overall", 0),
            }
        )

    cur_s = current_analytics["summary"]
    cur_r = current_analytics["ratios"]
    cur_h = current_analytics["health_score"]
    series.append(
        {
            "month": current_month,
            "income": cur_s["total_income"],
            "needs": cur_s["total_needs"],
            "wants": cur_s["total_wants"],
            "savings": cur_s["effective_monthly_savings"],
            "debt_balance": cur_s["total_debt_balance"],
            "savings_pct": cur_r["savings_pct"],
            "health_score": cur_h["overall"],
        }
    )

    mom_deltas: dict[str, Any] = {"has_prior": False}
    if prior_sorted:
        prev = prior_sorted[-1]
        prev_a = prev.get("analytics") or {}
        prev_s = prev_a.get("summary") or {}
        prev_r = prev_a.get("ratios") or {}
        prev_h = prev_a.get("health_score") or {}

        prev_cats = {
            c["category"]: float(c["amount"])
            for c in (prev_a.get("category_breakdown") or [])
        }
        cur_cats = {
            c["category"]: float(c["amount"])
            for c in (current_analytics.get("category_breakdown") or [])
        }
        category_changes = []
        for cat in set(prev_cats.keys()) | set(cur_cats.keys()):
            old_val = prev_cats.get(cat, 0.0)
            new_val = cur_cats.get(cat, 0.0)
            diff = _round2(new_val - old_val)
            pct = round(((new_val - old_val) / old_val) * 100.0, 1) if old_val > 0 else (100.0 if new_val > 0 else 0.0)
            if abs(diff) >= 1.0:
                category_changes.append(
                    {
                        "category": cat,
                        "previous": _round2(old_val),
                        "current": _round2(new_val),
                        "delta": diff,
                        "delta_pct": pct,
                    }
                )
        category_changes.sort(key=lambda x: abs(x["delta"]), reverse=True)

        mom_deltas = {
            "has_prior": True,
            "previous_month": prev["month"],
            "health_score_delta": int(cur_h["overall"]) - int(prev_h.get("overall", 0)),
            "wants_delta": _round2(cur_s["total_wants"] - float(prev_s.get("total_wants", 0))),
            "needs_delta": _round2(cur_s["total_needs"] - float(prev_s.get("total_needs", 0))),
            "savings_delta": _round2(
                cur_s["effective_monthly_savings"] - float(prev_s.get("effective_monthly_savings", 0))
            ),
            "savings_pct_delta": round(cur_r["savings_pct"] - float(prev_r.get("savings_pct", 0)), 1),
            "debt_delta": _round2(cur_s["total_debt_balance"] - float(prev_s.get("total_debt_balance", 0))),
            "top_category_changes": category_changes[:6],
            "prior_ai_summary": (prev.get("ai_advice") or {}).get("executive_diagnosis", ""),
            "prior_commitments": [
                step.get("action", "")
                for step in ((prev.get("ai_advice") or {}).get("action_plan_30_60_90") or [])[:3]
            ],
        }

    return {
        "monthly_series": series,
        "mom": mom_deltas,
    }


def compute_daily_spending_curve(
    current_items: list[dict[str, Any]],
    prior_items: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Build cumulative spending curve across days 1..30 comparing current month vs previous month."""
    checkpoints = [1, 5, 10, 15, 20, 25, 30]

    def _accumulate(items: list[dict[str, Any]]) -> list[float]:
        daily = [0.0] * 32
        for item in items:
            if str(item.get("tx_type") or "expense").lower() == "income":
                continue
            amt = max(0.0, float(item.get("amount", 0) or 0))
            if amt <= 0:
                continue
            date_str = str(item.get("date") or "")
            day = 15
            parts = date_str.split("-")
            if len(parts) == 3 and parts[2].isdigit():
                day = max(1, min(31, int(parts[2])))
            daily[day] += amt

        running = 0.0
        totals: list[float] = []
        idx = 1
        for cp in checkpoints:
            while idx <= cp and idx <= 31:
                running += daily[idx]
                idx += 1
            totals.append(_round2(running))
        return totals

    cur_curve = _accumulate(current_items)
    prev_curve = _accumulate(prior_items or [])
    return [
        {
            "day": f"Day {cp}",
            "current": cur_curve[i],
            "previous": prev_curve[i] if prior_items else None,
        }
        for i, cp in enumerate(checkpoints)
    ]


def analyze_finances(
    profile: dict[str, Any],
    ledger_items: list[dict[str, Any]],
    source_filter: str = "all",
    prior_snapshots: list[dict[str, Any]] | None = None,
    month: str = "2026-11",
    prior_ledger_items: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Run deterministic financial analytics across unified Bank CSV + Excel/Portal ledger items."""
    currency = str(profile.get("currency") or "INR").upper()
    base_income = max(0.0, float(profile.get("monthly_income", 0) or 0))
    secondary_income = max(0.0, float(profile.get("secondary_income", 0) or 0))
    current_savings = max(0.0, float(profile.get("current_savings", 0) or 0))
    goal_name = str(profile.get("goal_name") or "6-Month Emergency Fund")
    goal_target = max(0.0, float(profile.get("goal_target", 0) or 0))
    risk_tolerance = str(profile.get("risk_tolerance") or "moderate").lower()
    income_stability = str(profile.get("income_stability") or "stable").lower()
    raw_debts = profile.get("debts") or []

    # Filter ledger items by source if requested ("all", "bank_csv", "excel_portal")
    filtered_items = []
    source_totals: dict[str, float] = {"bank_csv": 0.0, "excel_import": 0.0, "portal_entry": 0.0}
    ledger_income = 0.0

    for item in ledger_items:
        src = str(item.get("source") or "portal_entry")
        amt = max(0.0, float(item.get("amount", 0) or 0))
        tx_type = str(item.get("tx_type") or "expense").lower()
        if amt <= 0:
            continue
        if tx_type == "expense":
            source_totals[src] = source_totals.get(src, 0.0) + amt

        if source_filter == "bank_csv" and src != "bank_csv":
            continue
        if source_filter == "excel_portal" and src not in ("excel_import", "portal_entry"):
            continue
        filtered_items.append(item)
        if tx_type == "income":
            ledger_income += amt

    # Use ledger income if present, otherwise fall back to profile income
    total_income = ledger_income if ledger_income > 0 else (base_income + secondary_income)
    if ledger_income > 0 and secondary_income > 0 and base_income == 0:
        total_income = ledger_income

    category_totals: dict[str, float] = {}
    category_sources: dict[str, set[str]] = {}
    bucket_totals = {"needs": 0.0, "wants": 0.0, "savings": 0.0}
    discretionary_subscriptions: list[dict[str, Any]] = []
    recurring_items: list[dict[str, Any]] = []

    for exp in filtered_items:
        if str(exp.get("tx_type") or "expense").lower() == "income":
            continue
        amount = max(0.0, float(exp.get("amount", 0) or 0))
        name = str(exp.get("name") or exp.get("category") or "Expense").strip()
        category = str(exp.get("category") or "other").strip().lower().replace(" ", "_")
        bucket = str(exp.get("bucket") or "").strip().lower()
        src = str(exp.get("source") or "portal_entry")
        is_recurring = bool(exp.get("recurring", False))

        if bucket not in ("needs", "wants", "savings"):
            if category in NEEDS_CATEGORIES:
                bucket = "needs"
            elif category in SAVINGS_CATEGORIES:
                bucket = "savings"
            else:
                bucket = "wants"

        category_totals[category] = category_totals.get(category, 0.0) + amount
        category_sources.setdefault(category, set()).add(src)
        bucket_totals[bucket] += amount

        if category in {"subscriptions", "streaming", "software", "memberships"}:
            discretionary_subscriptions.append({"name": name, "category": category, "amount": _round2(amount)})

        if is_recurring or category in {"subscriptions", "streaming", "software", "memberships", "housing", "utilities", "investments", "sip"}:
            recurring_items.append(
                {
                    "name": name,
                    "category": category,
                    "bucket": bucket,
                    "amount": _round2(amount),
                    "date": str(exp.get("date") or f"{month}-01"),
                    "source": src,
                }
            )

    debt_min_payments = sum(
        max(0.0, float(d.get("min_payment", 0) or 0))
        for d in raw_debts
        if float(d.get("balance", 0) or 0) > 0
    )
    total_debt_balance = sum(max(0.0, float(d.get("balance", 0) or 0)) for d in raw_debts)

    if "minimum_debt" not in category_totals and debt_min_payments > 0:
        category_totals["minimum_debt"] = debt_min_payments
        category_sources.setdefault("minimum_debt", set()).add("portal_entry")
        bucket_totals["needs"] += debt_min_payments

    total_needs = bucket_totals["needs"]
    total_wants = bucket_totals["wants"]
    explicit_savings = bucket_totals["savings"]
    total_outflow = total_needs + total_wants

    net_surplus = total_income - total_outflow - explicit_savings
    effective_monthly_savings = explicit_savings + max(0.0, net_surplus)

    needs_pct = _safe_pct(total_needs, total_income)
    wants_pct = _safe_pct(total_wants, total_income)
    savings_pct = _safe_pct(effective_monthly_savings, total_income)
    dti_pct = _safe_pct(debt_min_payments, total_income)

    essential_monthly = max(total_needs, 1.0)
    emergency_runway_months = round(current_savings / essential_monthly, 1) if total_needs > 0 else 0.0

    target_runway_months = 6 if income_stability == "variable" else 4
    recommended_emergency_fund = _round2(total_needs * target_runway_months)
    if goal_target <= 0:
        goal_target = recommended_emergency_fund if recommended_emergency_fund > 0 else _round2(total_income * 3)

    # Financial Health Score (0-100) across 4 pillars
    savings_score = min(30.0, max(0.0, (savings_pct / 20.0) * 30.0)) if total_income > 0 else 0.0
    if total_income <= 0:
        needs_score = 0.0
    elif needs_pct <= 50.0:
        needs_score = 25.0
    else:
        needs_score = max(0.0, 25.0 * (1.0 - (needs_pct - 50.0) / 35.0))

    runway_score = min(25.0, max(0.0, (emergency_runway_months / float(target_runway_months)) * 25.0))
    if dti_pct <= 10.0:
        debt_score = 20.0
    elif dti_pct <= 36.0:
        debt_score = max(4.0, 20.0 * (1.0 - (dti_pct - 10.0) / 30.0))
    else:
        debt_score = 0.0
    if net_surplus < 0:
        debt_score = max(0.0, debt_score - 8.0)

    health_score = int(round(savings_score + needs_score + runway_score + debt_score))
    if health_score >= 80:
        health_tier = "Thriving"
    elif health_score >= 60:
        health_tier = "Stable"
    elif health_score >= 40:
        health_tier = "Vulnerable"
    else:
        health_tier = "Critical"

    category_breakdown = sorted(
        [
            {
                "category": cat,
                "amount": _round2(amt),
                "pct_of_income": _safe_pct(amt, total_income),
                "sources": sorted(category_sources.get(cat, set())),
            }
            for cat, amt in category_totals.items()
        ],
        key=lambda x: x["amount"],
        reverse=True,
    )

    alerts: list[dict[str, str]] = []
    if net_surplus < 0:
        alerts.append(
            {
                "severity": "high",
                "title": "Monthly Cashflow Deficit",
                "detail": f"Outflows exceed income by {_round2(abs(net_surplus))} {currency}/month.",
            }
        )
    if needs_pct > 55.0:
        alerts.append(
            {
                "severity": "medium",
                "title": "Elevated Fixed Needs Burden",
                "detail": f"Needs consume {needs_pct}% of income (benchmark is 50%).",
            }
        )
    if wants_pct > 30.0:
        alerts.append(
            {
                "severity": "medium",
                "title": "High Discretionary Spending",
                "detail": f"Wants account for {wants_pct}% of income (benchmark is 30%).",
            }
        )
    if emergency_runway_months < 3.0 and total_needs > 0:
        alerts.append(
            {
                "severity": "high",
                "title": "Low Emergency Runway",
                "detail": f"Savings cover only {emergency_runway_months} months of essentials (target: {target_runway_months} months).",
            }
        )
    if dti_pct > 20.0:
        alerts.append(
            {
                "severity": "high",
                "title": "High Debt-to-Income Ratio",
                "detail": f"Minimum debt obligations take {dti_pct}% of income.",
            }
        )
    sub_total = sum(s["amount"] for s in discretionary_subscriptions)
    if total_income > 0 and sub_total > total_income * 0.04:
        alerts.append(
            {
                "severity": "low",
                "title": "Subscription Creep Detected",
                "detail": f"Recurring discretionary subscriptions total {_round2(sub_total)} {currency}/mo ({_safe_pct(sub_total, total_income)}% of income).",
            }
        )

    cut_opportunities = []
    for item in category_breakdown:
        cat = item["category"]
        if cat not in NEEDS_CATEGORIES and cat not in SAVINGS_CATEGORIES and item["amount"] > 0:
            suggested_cut = _round2(item["amount"] * 0.25)
            cut_opportunities.append(
                {
                    "category": cat,
                    "current_monthly": item["amount"],
                    "suggested_25pct_cut": suggested_cut,
                    "annual_savings": _round2(suggested_cut * 12),
                }
            )
    cut_opportunities = cut_opportunities[:4]

    extra_for_debt = max(
        0.0,
        round(max(0.0, net_surplus) * 0.5 + sum(c["suggested_25pct_cut"] for c in cut_opportunities[:2]), 2),
    )
    debt_baseline = simulate_debt_payoff(raw_debts, extra_monthly_payment=0.0, strategy="avalanche")
    debt_avalanche = simulate_debt_payoff(raw_debts, extra_monthly_payment=extra_for_debt, strategy="avalanche")
    debt_snowball = simulate_debt_payoff(raw_debts, extra_monthly_payment=extra_for_debt, strategy="snowball")

    recommended_budget = {
        "needs_target": _round2(total_income * 0.50),
        "wants_target": _round2(total_income * 0.30),
        "savings_target": _round2(total_income * 0.20),
        "needs_actual": _round2(total_needs),
        "wants_actual": _round2(total_wants),
        "savings_actual": _round2(effective_monthly_savings),
    }

    default_yield = 7.0 if currency == "INR" else 4.5
    optimized_yield = 10.0 if currency == "INR" else 6.5
    optimized_monthly_savings = effective_monthly_savings + sum(c["suggested_25pct_cut"] for c in cut_opportunities[:2])
    savings_projection_current = project_savings(
        current_savings, effective_monthly_savings, annual_yield_pct=default_yield, years=5
    )
    savings_projection_optimized = project_savings(
        current_savings, optimized_monthly_savings, annual_yield_pct=optimized_yield, years=5
    )

    remaining_for_goal = max(0.0, goal_target - current_savings)
    if remaining_for_goal <= 0:
        months_to_goal = 0
        months_to_goal_optimized = 0
    else:
        months_to_goal = int(round(remaining_for_goal / effective_monthly_savings)) if effective_monthly_savings > 0 else None
        months_to_goal_optimized = (
            int(round(remaining_for_goal / optimized_monthly_savings)) if optimized_monthly_savings > 0 else None
        )

    analytics_result: dict[str, Any] = {
        "month": month,
        "source_filter": source_filter,
        "currency": currency,
        "source_breakdown": {
            "bank_csv": _round2(source_totals.get("bank_csv", 0.0)),
            "excel_import": _round2(source_totals.get("excel_import", 0.0)),
            "portal_entry": _round2(source_totals.get("portal_entry", 0.0)),
        },
        "summary": {
            "total_income": _round2(total_income),
            "total_needs": _round2(total_needs),
            "total_wants": _round2(total_wants),
            "explicit_savings": _round2(explicit_savings),
            "effective_monthly_savings": _round2(effective_monthly_savings),
            "net_surplus": _round2(net_surplus),
            "total_debt_balance": _round2(total_debt_balance),
            "debt_min_payments": _round2(debt_min_payments),
            "current_savings": _round2(current_savings),
            "emergency_runway_months": emergency_runway_months,
            "recommended_emergency_fund": recommended_emergency_fund,
        },
        "ratios": {
            "needs_pct": needs_pct,
            "wants_pct": wants_pct,
            "savings_pct": savings_pct,
            "dti_pct": dti_pct,
        },
        "health_score": {
            "overall": health_score,
            "tier": health_tier,
            "pillars": {
                "savings_rate": round(savings_score, 1),
                "needs_control": round(needs_score, 1),
                "emergency_runway": round(runway_score, 1),
                "debt_health": round(debt_score, 1),
            },
        },
        "recommended_50_30_20": recommended_budget,
        "category_breakdown": category_breakdown,
        "alerts": alerts,
        "cut_opportunities": cut_opportunities,
        "goal_analysis": {
            "goal_name": goal_name,
            "goal_target": _round2(goal_target),
            "current_savings": _round2(current_savings),
            "progress_pct": min(100.0, _safe_pct(current_savings, goal_target)) if goal_target > 0 else 0.0,
            "months_to_goal_current": months_to_goal,
            "months_to_goal_optimized": months_to_goal_optimized,
            "risk_tolerance": risk_tolerance,
            "income_stability": income_stability,
        },
        "debt_simulation": {
            "extra_monthly_applied": extra_for_debt,
            "baseline": debt_baseline,
            "avalanche": debt_avalanche,
            "snowball": debt_snowball,
            "interest_saved_avalanche": _round2(max(0.0, debt_baseline["total_interest"] - debt_avalanche["total_interest"])),
            "months_saved_avalanche": max(0, debt_baseline["months"] - debt_avalanche["months"]),
        },
        "savings_projection": {
            "current_path": savings_projection_current,
            "optimized_path": savings_projection_optimized,
        },
    }

    analytics_result["historical_trends"] = compute_historical_trends(
        month, analytics_result, prior_snapshots or []
    )
    analytics_result["daily_spending_curve"] = compute_daily_spending_curve(
        filtered_items, prior_ledger_items
    )
    analytics_result["recurring_summary"] = {
        "items": recurring_items,
        "total_monthly": _round2(sum(float(r["amount"]) for r in recurring_items)),
    }
    return analytics_result
