"""Built-in realistic Indian & multi-month demo personas for instant hackathon judging."""

from __future__ import annotations

from typing import Any


def get_demo_bundle(persona: str) -> dict[str, Any]:
    """Return a full multi-month workspace bundle (profile + saved Excel map + Bank CSV & Excel ledger + Oct snapshot)."""
    key = persona.strip().lower()

    if key == "priya":
        # Freelancer with variable income in INR
        return {
            "profile": {
                "currency": "INR",
                "monthly_income": 92000.0,
                "secondary_income": 18000.0,
                "current_savings": 135000.0,
                "goal_name": "6-Month Freelancer Buffer & Tax Reserve",
                "goal_target": 320000.0,
                "risk_tolerance": "conservative",
                "income_stability": "variable",
                "preferred_input_mode": "excel",
                "debts": [
                    {"name": "Laptop No-Cost EMI", "balance": 42000.0, "apr": 14.0, "min_payment": 7000.0},
                ],
            },
            "excel_mapping": {
                "sheet_name": "Monthly_Tracker",
                "filename": "priya_freelance_sheet.xlsx",
                "column_map": {
                    "date": "Date",
                    "name": "Particulars",
                    "category": "Category",
                    "amount": "Amount (INR)",
                    "type": "Flow",
                    "recurring": "Fixed?",
                },
            },
            "months": {
                "2026-10": [
                    {"tx_id": "p-oct-1", "date": "2026-10-03", "month": "2026-10", "name": "Client Retainer NEFT", "category": "income", "bucket": "income", "amount": 85000, "tx_type": "income", "source": "bank_csv", "recurring": False},
                    {"tx_id": "p-oct-2", "date": "2026-10-05", "month": "2026-10", "name": "Koramangala Studio Rent", "category": "housing", "bucket": "needs", "amount": 26000, "tx_type": "expense", "source": "bank_csv", "recurring": True},
                    {"tx_id": "p-oct-3", "date": "2026-10-08", "month": "2026-10", "name": "BigBasket & Milk", "category": "groceries", "bucket": "needs", "amount": 8200, "tx_type": "expense", "source": "bank_csv", "recurring": False},
                    {"tx_id": "p-oct-4", "date": "2026-10-12", "month": "2026-10", "name": "Adobe Creative Cloud + Figma", "category": "subscriptions", "bucket": "wants", "amount": 4800, "tx_type": "expense", "source": "excel_import", "recurring": True},
                    {"tx_id": "p-oct-5", "date": "2026-10-18", "month": "2026-10", "name": "Cafes & Client Lunches", "category": "dining", "bucket": "wants", "amount": 13500, "tx_type": "expense", "source": "excel_import", "recurring": False},
                    {"tx_id": "p-oct-6", "date": "2026-10-22", "month": "2026-10", "name": "Mutual Fund SIP", "category": "investments", "bucket": "savings", "amount": 12000, "tx_type": "expense", "source": "bank_csv", "recurring": True},
                ],
                "2026-11": [
                    {"tx_id": "p-nov-1", "date": "2026-11-02", "month": "2026-11", "name": "UX Sprint Payout", "category": "income", "bucket": "income", "amount": 92000, "tx_type": "income", "source": "bank_csv", "recurring": False},
                    {"tx_id": "p-nov-2", "date": "2026-11-14", "month": "2026-11", "name": "Logo Design Bonus", "category": "income", "bucket": "income", "amount": 18000, "tx_type": "income", "source": "bank_csv", "recurring": False},
                    {"tx_id": "p-nov-3", "date": "2026-11-05", "month": "2026-11", "name": "Koramangala Studio Rent", "category": "housing", "bucket": "needs", "amount": 26000, "tx_type": "expense", "source": "bank_csv", "recurring": True},
                    {"tx_id": "p-nov-4", "date": "2026-11-07", "month": "2026-11", "name": "Blinkit & Groceries", "category": "groceries", "bucket": "needs", "amount": 7800, "tx_type": "expense", "source": "bank_csv", "recurring": False},
                    {"tx_id": "p-nov-5", "date": "2026-11-10", "month": "2026-11", "name": "Airtel Fiber & Electricity", "category": "utilities", "bucket": "needs", "amount": 3600, "tx_type": "expense", "source": "bank_csv", "recurring": True},
                    {"tx_id": "p-nov-6", "date": "2026-11-12", "month": "2026-11", "name": "Adobe + Figma + Notion", "category": "subscriptions", "bucket": "wants", "amount": 4800, "tx_type": "expense", "source": "excel_import", "recurring": True},
                    {"tx_id": "p-nov-7", "date": "2026-11-18", "month": "2026-11", "name": "Coworking & Client Coffee", "category": "dining", "bucket": "wants", "amount": 9800, "tx_type": "expense", "source": "excel_import", "recurring": False},
                    {"tx_id": "p-nov-8", "date": "2026-11-24", "month": "2026-11", "name": "Emergency Liquid Fund SIP", "category": "emergency_fund", "bucket": "savings", "amount": 22000, "tx_type": "expense", "source": "portal_entry", "recurring": True},
                ],
            },
        }

    # Default "aarav" persona: Young Indian software engineer turning finances around Oct -> Nov
    return {
        "profile": {
            "currency": "INR",
            "monthly_income": 75000.0,
            "secondary_income": 0.0,
            "current_savings": 32000.0,
            "goal_name": "4-Month Emergency Fund & Debt Freedom",
            "goal_target": 180000.0,
            "risk_tolerance": "moderate",
            "income_stability": "stable",
            "preferred_input_mode": "portal",
            "debts": [
                {"name": "HDFC Credit Card", "balance": 115000.0, "apr": 36.0, "min_payment": 4500.0},
                {"name": "Education Loan", "balance": 180000.0, "apr": 9.5, "min_payment": 4000.0},
            ],
        },
        "excel_mapping": {
            "sheet_name": "Expenses_2026",
            "filename": "aarav_personal_tracker.xlsx",
            "column_map": {
                "date": "Date",
                "name": "Particulars",
                "category": "Category",
                "amount": "Amount",
                "type": "Type",
                "recurring": "Monthly?",
            },
        },
        "months": {
            "2026-10": [
                {"tx_id": "a-oct-1", "date": "2026-10-01", "month": "2026-10", "name": "TechCorp India Salary", "category": "income", "bucket": "income", "amount": 75000, "tx_type": "income", "source": "bank_csv", "recurring": True},
                {"tx_id": "a-oct-2", "date": "2026-10-02", "month": "2026-10", "name": "HSR Layout Apartment Rent", "category": "housing", "bucket": "needs", "amount": 22000, "tx_type": "expense", "source": "bank_csv", "recurring": True},
                {"tx_id": "a-oct-3", "date": "2026-10-04", "month": "2026-10", "name": "BESCOM & Airtel Broadband", "category": "utilities", "bucket": "needs", "amount": 3200, "tx_type": "expense", "source": "bank_csv", "recurring": True},
                {"tx_id": "a-oct-4", "date": "2026-10-06", "month": "2026-10", "name": "BigBasket & DMart Groceries", "category": "groceries", "bucket": "needs", "amount": 7500, "tx_type": "expense", "source": "bank_csv", "recurring": False},
                {"tx_id": "a-oct-5", "date": "2026-10-09", "month": "2026-10", "name": "Metro & Uber Commute", "category": "transportation", "bucket": "needs", "amount": 3800, "tx_type": "expense", "source": "excel_import", "recurring": False},
                {"tx_id": "a-oct-6", "date": "2026-10-12", "month": "2026-10", "name": "Swiggy & Zomato Delivery", "category": "dining", "bucket": "wants", "amount": 14200, "tx_type": "expense", "source": "bank_csv", "recurring": False},
                {"tx_id": "a-oct-7", "date": "2026-10-15", "month": "2026-10", "name": "OTT + Cult.fit + Apps", "category": "subscriptions", "bucket": "wants", "amount": 3800, "tx_type": "expense", "source": "excel_import", "recurring": True},
                {"tx_id": "a-oct-8", "date": "2026-10-20", "month": "2026-10", "name": "Myntra & Amazon Shopping", "category": "shopping", "bucket": "wants", "amount": 8500, "tx_type": "expense", "source": "bank_csv", "recurring": False},
                {"tx_id": "a-oct-9", "date": "2026-10-25", "month": "2026-10", "name": "Nifty 50 SIP", "category": "investments", "bucket": "savings", "amount": 3000, "tx_type": "expense", "source": "bank_csv", "recurring": True},
            ],
            "2026-11": [
                {"tx_id": "a-nov-1", "date": "2026-11-01", "month": "2026-11", "name": "TechCorp India Salary", "category": "income", "bucket": "income", "amount": 75000, "tx_type": "income", "source": "bank_csv", "recurring": True},
                {"tx_id": "a-nov-2", "date": "2026-11-02", "month": "2026-11", "name": "HSR Layout Apartment Rent", "category": "housing", "bucket": "needs", "amount": 22000, "tx_type": "expense", "source": "bank_csv", "recurring": True},
                {"tx_id": "a-nov-3", "date": "2026-11-04", "month": "2026-11", "name": "BESCOM & Airtel Broadband", "category": "utilities", "bucket": "needs", "amount": 3100, "tx_type": "expense", "source": "bank_csv", "recurring": True},
                {"tx_id": "a-nov-4", "date": "2026-11-07", "month": "2026-11", "name": "Zepto & DMart Groceries", "category": "groceries", "bucket": "needs", "amount": 7800, "tx_type": "expense", "source": "bank_csv", "recurring": False},
                {"tx_id": "a-nov-5", "date": "2026-11-10", "month": "2026-11", "name": "Metro & Rapido Commute", "category": "transportation", "bucket": "needs", "amount": 3500, "tx_type": "expense", "source": "portal_entry", "recurring": False},
                {"tx_id": "a-nov-6", "date": "2026-11-14", "month": "2026-11", "name": "Swiggy & Dining Out", "category": "dining", "bucket": "wants", "amount": 10200, "tx_type": "expense", "source": "bank_csv", "recurring": False},
                {"tx_id": "a-nov-7", "date": "2026-11-15", "month": "2026-11", "name": "OTT & Gym (Trimmed 2 Apps)", "category": "subscriptions", "bucket": "wants", "amount": 2000, "tx_type": "expense", "source": "excel_import", "recurring": True},
                {"tx_id": "a-nov-8", "date": "2026-11-19", "month": "2026-11", "name": "Flipkart Festive Order", "category": "shopping", "bucket": "wants", "amount": 6400, "tx_type": "expense", "source": "bank_csv", "recurring": False},
                {"tx_id": "a-nov-9", "date": "2026-11-25", "month": "2026-11", "name": "Emergency Fund + Nifty SIP", "category": "investments", "bucket": "savings", "amount": 8500, "tx_type": "expense", "source": "portal_entry", "recurring": True},
            ],
        },
    }
