"""Unit and API integration tests for FinWise AI backend."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.analytics import analyze_finances, simulate_debt_payoff
from app.handler import lambda_handler
from app.ingestion import normalize_excel_rows, parse_bank_csv
from app.storage import WorkspaceStore


SAMPLE_CSV = """Date,Narration,Debit,Credit
2026-10-01,TechCorp Salary NEFT,,75000
2026-10-02,HSR Apartment Rent,22000,
2026-10-05,BigBasket Groceries,6500,
2026-10-10,Swiggy Food Delivery,9500,
2026-10-12,Netflix & Spotify Subscription,1200,
2026-10-20,Nifty 50 Mutual Fund SIP,5000,
"""


def test_parse_bank_csv_indian_merchants():
    items = parse_bank_csv(SAMPLE_CSV, default_month="2026-10")
    assert len(items) == 6
    income_items = [i for i in items if i["tx_type"] == "income"]
    assert len(income_items) == 1
    assert income_items[0]["amount"] == 75000.0
    cats = {i["name"]: i["category"] for i in items}
    assert cats["HSR Apartment Rent"] == "housing"
    assert cats["BigBasket Groceries"] == "groceries"
    assert cats["Swiggy Food Delivery"] == "dining"
    assert cats["Netflix & Spotify Subscription"] == "subscriptions"
    assert cats["Nifty 50 Mutual Fund SIP"] == "investments"


def test_normalize_excel_rows():
    rows = [
        {"Particulars": "Milk & Vegetables", "Spent": "Rs 3,200", "Cat": "Groceries", "When": "2026-11-03"},
        {"Particulars": "Gym Membership", "Spent": "1500", "Cat": "", "When": "2026-11-05"},
    ]
    col_map = {"name": "Particulars", "amount": "Spent", "category": "Cat", "date": "When"}
    items = normalize_excel_rows(rows, col_map, default_month="2026-11")
    assert len(items) == 2
    assert items[0]["category"] == "groceries"
    assert items[0]["amount"] == 3200.0
    assert items[1]["category"] == "subscriptions"
    assert items[1]["source"] == "excel_import"


def test_debt_avalanche_beats_baseline():
    debts = [
        {"name": "Credit Card", "balance": 100000, "apr": 36.0, "min_payment": 4000},
        {"name": "Personal Loan", "balance": 50000, "apr": 12.0, "min_payment": 2000},
    ]
    base = simulate_debt_payoff(debts, extra_monthly_payment=0, strategy="avalanche")
    accel = simulate_debt_payoff(debts, extra_monthly_payment=6000, strategy="avalanche")
    assert accel["months"] < base["months"]
    assert accel["total_interest"] < base["total_interest"]


def test_source_filtering_and_historical_trends():
    profile = {"currency": "INR", "monthly_income": 75000, "current_savings": 40000, "debts": []}
    prior_oct = analyze_finances(
        profile=profile,
        ledger_items=[
            {"tx_id": "1", "month": "2026-10", "name": "Rent", "category": "housing", "amount": 22000, "tx_type": "expense", "source": "bank_csv"},
            {"tx_id": "2", "month": "2026-10", "name": "Swiggy", "category": "dining", "amount": 12000, "tx_type": "expense", "source": "bank_csv"},
        ],
        month="2026-10",
    )
    nov_items = [
        {"tx_id": "3", "month": "2026-11", "name": "Rent", "category": "housing", "amount": 22000, "tx_type": "expense", "source": "bank_csv"},
        {"tx_id": "4", "month": "2026-11", "name": "Swiggy", "category": "dining", "amount": 8000, "tx_type": "expense", "source": "bank_csv"},
        {"tx_id": "5", "month": "2026-11", "name": "Cash Coffee", "category": "dining", "amount": 1500, "tx_type": "expense", "source": "excel_import"},
    ]
    combined = analyze_finances(
        profile=profile,
        ledger_items=nov_items,
        source_filter="all",
        prior_snapshots=[{"month": "2026-10", "analytics": prior_oct}],
        month="2026-11",
    )
    assert combined["source_breakdown"]["bank_csv"] == 30000.0
    assert combined["source_breakdown"]["excel_import"] == 1500.0
    assert combined["historical_trends"]["mom"]["has_prior"] is True
    assert combined["historical_trends"]["mom"]["wants_delta"] == -2500.0

    csv_only = analyze_finances(profile=profile, ledger_items=nov_items, source_filter="bank_csv", month="2026-11")
    assert csv_only["summary"]["total_wants"] == 8000.0


def test_handler_end_to_end_with_mocked_bedrock():
    store = WorkspaceStore(table_name="", archive_bucket="")
    with patch("app.handler.generate_financial_strategy") as mock_gen, patch("app.handler.chat_with_coach") as mock_chat:
        mock_gen.return_value = {
            "mode": "mocked-bedrock",
            "model_id": "us.amazon.nova-pro-v1:0",
            "executive_diagnosis": "Test diagnosis",
            "history_reflection": "Progress noted",
            "budgeting_suggestions": ["Cut dining"],
            "savings_strategy": "Build buffer",
            "action_plan_30_60_90": [{"window": "Days 1-30", "action": "Trim", "impact": "Save"}],
            "literacy_cards": [],
        }
        mock_chat.return_value = {"reply": "Pay off 36% APR card first.", "mode": "mocked-bedrock", "model_id": "nova"}

        # 1. Load demo persona
        res = lambda_handler(
            {
                "rawPath": "/api/demo/load",
                "requestContext": {"http": {"method": "POST"}},
                "body": json.dumps({"persona": "aarav", "user_id": "test_user"}),
            },
            store=store,
        )
        assert res["statusCode"] == 200
        body = json.loads(res["body"])
        assert body["analytics"]["currency"] == "INR"
        assert body["analytics"]["historical_trends"]["mom"]["has_prior"] is True
        assert body["excel_mapping"]["filename"] == "aarav_personal_tracker.xlsx"

        # 2. Add a portal ledger item
        res2 = lambda_handler(
            {
                "rawPath": "/api/ledger",
                "requestContext": {"http": {"method": "POST"}},
                "body": json.dumps({
                    "user_id": "test_user",
                    "month": "2026-11",
                    "item": {"name": "Medical Pharmacy", "amount": 900, "category": "healthcare"},
                }),
            },
            store=store,
        )
        assert res2["statusCode"] == 200

        # 3. Chat with historical context
        res3 = lambda_handler(
            {
                "rawPath": "/api/chat",
                "requestContext": {"http": {"method": "POST"}},
                "body": json.dumps({"user_id": "test_user", "month": "2026-11", "question": "What should I do first?"}),
            },
            store=store,
        )
        assert res3["statusCode"] == 200
        chat_body = json.loads(res3["body"])
        assert len(chat_body["chat_history"]) == 2


def test_fresh_account_and_multi_month_csv():
    store = WorkspaceStore(table_name="", archive_bucket="")
    # 1. Create fresh blank account
    res = lambda_handler(
        {
            "rawPath": "/api/account/create",
            "requestContext": {"http": {"method": "POST"}},
            "body": json.dumps({"display_name": "Surya", "currency": "INR", "monthly_income": 60000}),
        },
        store=store,
    )
    assert res["statusCode"] == 200
    created = json.loads(res["body"])
    assert created["user_id"] == "surya"
    assert created["profile"]["display_name"] == "Surya"
    assert len(created["ledger"]) == 0

    # 2. Upload multi-month CSV
    multi_csv = """Date,Narration,Debit,Credit
25-Oct-2026,Rent,20000,
15-Nov-2026,Rent,20000,
18-Nov-2026,Swiggy Order,4500,
"""
    res2 = lambda_handler(
        {
            "rawPath": "/api/ingest/csv",
            "requestContext": {"http": {"method": "POST"}},
            "body": json.dumps({"user_id": "surya", "month": "2026-11", "csv_text": multi_csv}),
        },
        store=store,
    )
    assert res2["statusCode"] == 200
    ingested = json.loads(res2["body"])
    assert ingested["month"] == "2026-11"
    assert ingested["analytics"]["historical_trends"]["mom"]["has_prior"] is True
    assert len(ingested["analytics"]["daily_spending_curve"]) == 7
    assert len(ingested["uploaded_files"]) == 1
    assert ingested["uploaded_files"][0]["row_count"] == 3

    # 3. Carry forward recurring items into next month (2026-12) without re-uploading
    res3 = lambda_handler(
        {
            "rawPath": "/api/month/carry-forward",
            "requestContext": {"http": {"method": "POST"}},
            "body": json.dumps({"user_id": "surya", "source_month": "2026-11", "target_month": "2026-12"}),
        },
        store=store,
    )
    assert res3["statusCode"] == 200
    next_m = json.loads(res3["body"])
    assert next_m["month"] == "2026-12"
    assert next_m["carried_count"] >= 1
    assert any("Rent" in it["name"] for it in next_m["ledger"])
