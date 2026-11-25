"""Dual-input ingestion: Bank Statement CSV parser + Excel row normalizer + smart Indian/global categorizer."""

from __future__ import annotations

import csv
import hashlib
import io
import re
from typing import Any


CATEGORY_KEYWORDS: dict[str, tuple[str, str]] = {
    r"rent|landlord|apartment|lease|mortgage|hoa|maintenance|society": ("housing", "needs"),
    r"electric|bescom|tata power|water|gas bill|internet|broadband|act fibernet|airtel|jio|vi |comcast|verizon|utility|recharge": ("utilities", "needs"),
    r"whole foods|trader joe|kroger|walmart|aldi|grocery|supermarket|bigbasket|blinkit|zepto|instamart|dmart|more retail|milk|vegetables": ("groceries", "needs"),
    r"pharmacy|apollo|medplus|1mg|pharmeasy|cvs|walgreens|hospital|clinic|dental|doctor|health|medical": ("healthcare", "needs"),
    r"insurance|lic|hdfc ergo|icici lombard|star health|geico|allstate|policy|premium": ("insurance", "needs"),
    r"uber|lyft|ola|rapido|metro|irctc|transit|shell|hpcl|bpcl|indian oil|fuel|petrol|diesel|fastag|parking": ("transportation", "needs"),
    r"tuition|coursera|udemy|school|college|textbook|education|certification": ("education", "needs"),
    r"loan|emi|credit card payment|student loan|bajaj finserv|hdfc card|icici card": ("minimum_debt", "needs"),
    r"netflix|spotify|hulu|disney|hotstar|jiocinema|youtube|apple\.com/bill|prime video|cult\.fit|gym|fitness|patreon|icloud|chatgpt|subscription": ("subscriptions", "wants"),
    r"starbucks|third wave|blue tokai|coffee|cafe|mcdonald|chipotle|zomato|swiggy|doordash|ubereats|restaurant|dining|bar|pizza|kfc|domino": ("dining", "wants"),
    r"amazon|target|flipkart|myntra|ajio|nykaa|nike|zara|mall|shopping|best buy|croma|reliance digital": ("shopping", "wants"),
    r"flight|airbnb|makemytrip|goibibo|hotel|airline|indigo|air india|delta|travel|vacation|oyo": ("travel", "wants"),
    r"vanguard|fidelity|zerodha|groww|coin|kuvera|upstox|ppf|nps|mutual fund|etf|sip|fd |recurring deposit|savings transfer": ("investments", "savings"),
}

EXPLICIT_CATEGORY_BUCKET = {
    "housing": "needs",
    "rent": "needs",
    "utilities": "needs",
    "groceries": "needs",
    "healthcare": "needs",
    "insurance": "needs",
    "transportation": "needs",
    "education": "needs",
    "minimum_debt": "needs",
    "dining": "wants",
    "subscriptions": "wants",
    "shopping": "wants",
    "travel": "wants",
    "entertainment": "wants",
    "other_discretionary": "wants",
    "savings": "savings",
    "emergency_fund": "savings",
    "investments": "savings",
    "sip": "savings",
    "retirement": "savings",
}


def classify_description(description: str, explicit_category: str = "") -> tuple[str, str]:
    """Return (category, bucket) from explicit category or merchant description keywords."""
    if explicit_category:
        cleaned = explicit_category.strip().lower().replace(" ", "_")
        if cleaned in EXPLICIT_CATEGORY_BUCKET:
            return cleaned, EXPLICIT_CATEGORY_BUCKET[cleaned]
        for pattern, (cat, bucket) in CATEGORY_KEYWORDS.items():
            if re.search(pattern, cleaned):
                return cat, bucket

    lowered = description.lower()
    for pattern, (category, bucket) in CATEGORY_KEYWORDS.items():
        if re.search(pattern, lowered):
            return category, bucket
    return "other_discretionary", "wants"


MONTH_ABBR = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


def _normalize_month(date_str: str, fallback_month: str) -> str:
    raw = str(date_str or "").strip()
    if not raw:
        return fallback_month
    # Match YYYY-MM-DD or YYYY/MM/DD or YYYY-MM
    m = re.match(r"^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$", raw)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}"
    # Match DD-MM-YYYY or DD/MM/YYYY (or MM/DD/YYYY if second part > 12)
    m = re.match(r"^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$", raw)
    if m:
        p1, p2, yr = int(m.group(1)), int(m.group(2)), m.group(3)
        year = f"20{yr}" if len(yr) == 2 else yr
        month_num = p1 if p2 > 12 else p2
        month_num = max(1, min(12, month_num))
        return f"{year}-{month_num:02d}"
    # Match DD-MMM-YYYY or DD MMM YYYY (e.g. 25-Jul-2022)
    m = re.match(r"^(\d{1,2})[-/\s]([A-Za-z]{3})[-/\s](\d{2,4})$", raw)
    if m:
        mon = MONTH_ABBR.get(m.group(2).lower())
        if mon:
            yr = m.group(3)
            year = f"20{yr}" if len(yr) == 2 else yr
            return f"{year}-{mon:02d}"
    return fallback_month


def _parse_amount(value: Any) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    raw = str(value or "").strip()
    if not raw:
        return 0.0
    numeric_str = re.sub(r"[^0-9.\-]", "", raw)
    if not numeric_str or numeric_str in ("-", "."):
        return 0.0
    return float(numeric_str)


def _deterministic_tx_id(source: str, date_str: str, desc: str, amount: float, idx: int) -> str:
    digest = hashlib.sha1(f"{source}|{date_str}|{desc.lower()}|{amount:.2f}|{idx}".encode("utf-8")).hexdigest()
    return digest[:12]


def parse_bank_csv(csv_text: str, default_month: str = "2026-11") -> list[dict[str, Any]]:
    """Parse standard bank statement CSV (supports Debit/Credit columns or single Amount column)."""
    cleaned = csv_text.strip()
    if not cleaned:
        raise ValueError("CSV input is empty.")

    reader = csv.DictReader(io.StringIO(cleaned))
    if not reader.fieldnames:
        raise ValueError("CSV must contain a header row.")

    headers = {h.strip().lower(): h for h in reader.fieldnames if h}
    date_col = headers.get("date") or headers.get("txn date") or headers.get("transaction date") or headers.get("value date")
    desc_col = (
        headers.get("description")
        or headers.get("narration")
        or headers.get("particulars")
        or headers.get("merchant")
        or headers.get("remarks")
        or headers.get("name")
        or headers.get("title")
    )
    amt_col = headers.get("amount") or headers.get("value")
    debit_col = headers.get("debit") or headers.get("withdrawal") or headers.get("dr")
    credit_col = headers.get("credit") or headers.get("deposit") or headers.get("cr")
    type_col = headers.get("type") or headers.get("transaction_type") or headers.get("dr/cr")
    cat_col = headers.get("category")

    if not desc_col or (not amt_col and not debit_col and not credit_col):
        raise ValueError(
            "Bank CSV must include Description/Narration and Amount (or Debit/Credit) columns."
        )

    items: list[dict[str, Any]] = []
    for idx, row in enumerate(reader):
        desc = str(row.get(desc_col) or "").strip()
        if not desc:
            continue
        date_val = str(row.get(date_col) or "").strip() if date_col else ""
        month = _normalize_month(date_val, default_month)

        tx_type = "expense"
        amount = 0.0

        if debit_col or credit_col:
            dr_amt = abs(_parse_amount(row.get(debit_col))) if debit_col else 0.0
            cr_amt = abs(_parse_amount(row.get(credit_col))) if credit_col else 0.0
            if cr_amt > 0 and dr_amt == 0:
                tx_type = "income"
                amount = cr_amt
            elif dr_amt > 0:
                tx_type = "expense"
                amount = dr_amt
        elif amt_col:
            raw_amt = _parse_amount(row.get(amt_col))
            amount = abs(raw_amt)
            raw_type = str(row.get(type_col) or "").strip().lower() if type_col else ""
            if raw_type in ("income", "credit", "cr", "deposit", "salary") or (
                not raw_type and re.search(r"salary|payroll|direct deposit|credit interest|refund|freelance payout", desc.lower())
            ):
                tx_type = "income"
            elif raw_amt > 0 and raw_type == "" and "credit" in (amt_col.lower()):
                tx_type = "income"

        if amount <= 0:
            continue

        explicit_cat = str(row.get(cat_col) or "").strip() if cat_col else ""
        if tx_type == "income":
            category, bucket = "income", "income"
        else:
            category, bucket = classify_description(desc, explicit_cat)

        recurring = category in {"housing", "utilities", "subscriptions", "insurance", "minimum_debt", "sip"}
        items.append(
            {
                "tx_id": _deterministic_tx_id("bank_csv", date_val or month, desc, amount, idx),
                "date": date_val or f"{month}-01",
                "month": month,
                "name": desc,
                "category": category,
                "bucket": bucket,
                "amount": round(amount, 2),
                "tx_type": tx_type,
                "source": "bank_csv",
                "recurring": recurring,
            }
        )

    return items


def normalize_excel_rows(
    rows: list[dict[str, Any]],
    column_map: dict[str, str],
    default_month: str = "2026-11",
    source: str = "excel_import",
) -> list[dict[str, Any]]:
    """Normalize client-parsed Excel rows using the user's saved or chosen column mapping."""
    name_col = column_map.get("name", "")
    amount_col = column_map.get("amount", "")
    category_col = column_map.get("category", "")
    date_col = column_map.get("date", "")
    type_col = column_map.get("type", "")
    recurring_col = column_map.get("recurring", "")

    if not name_col or not amount_col:
        raise ValueError("Column mapping must include at least 'name' and 'amount' columns.")

    items: list[dict[str, Any]] = []
    for idx, row in enumerate(rows):
        desc = str(row.get(name_col) or "").strip()
        amount = abs(_parse_amount(row.get(amount_col)))
        if not desc or amount <= 0:
            continue

        date_val = str(row.get(date_col) or "").strip() if date_col else ""
        month = _normalize_month(date_val, default_month)
        raw_type = str(row.get(type_col) or "").strip().lower() if type_col else ""
        tx_type = "income" if raw_type in ("income", "credit", "earning", "salary") else "expense"

        explicit_cat = str(row.get(category_col) or "").strip() if category_col else ""
        if tx_type == "income":
            category, bucket = "income", "income"
        else:
            category, bucket = classify_description(desc, explicit_cat)

        raw_rec = str(row.get(recurring_col) or "").strip().lower() if recurring_col else ""
        recurring = (
            raw_rec in ("yes", "true", "1", "y", "recurring", "monthly")
            or category in {"housing", "utilities", "subscriptions", "insurance", "minimum_debt", "sip"}
        )

        items.append(
            {
                "tx_id": _deterministic_tx_id(source, date_val or month, desc, amount, idx),
                "date": date_val or f"{month}-01",
                "month": month,
                "name": desc,
                "category": category,
                "bucket": bucket,
                "amount": round(amount, 2),
                "tx_type": tx_type,
                "source": source,
                "recurring": recurring,
            }
        )
    return items
