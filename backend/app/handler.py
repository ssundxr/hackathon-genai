"""AWS Lambda HTTP API v2 handler for FinWise AI."""

from __future__ import annotations

import json
import logging
import mimetypes
import os
import uuid
from typing import Any

import boto3
from botocore.exceptions import ClientError

from app.analytics import analyze_finances
from app.bedrock_service import _build_deterministic_fallback_strategy, chat_with_coach, generate_financial_strategy
from app.demo_data import get_demo_bundle
from app.ingestion import classify_description, normalize_excel_rows, parse_bank_csv
from app.storage import WorkspaceStore

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

_STORE = WorkspaceStore()
_ASSET_CACHE: dict[str, tuple[str, str]] = {}
_S3_CLIENT = None


def _get_s3_client():
    global _S3_CLIENT
    if _S3_CLIENT is None:
        _S3_CLIENT = boto3.client("s3")
    return _S3_CLIENT


def _serve_static_asset(path: str) -> dict[str, Any]:
    bucket = os.environ.get("PORTAL_BUCKET", "")
    if not bucket:
        return _response(404, {"error": "Portal bucket not configured."})

    key = path.lstrip("/") or "index.html"
    if key in _ASSET_CACHE:
        content, ctype = _ASSET_CACHE[key]
        return {
            "statusCode": 200,
            "headers": {"Content-Type": ctype, "Cache-Control": "public, max-age=300"},
            "body": content,
        }

    s3 = _get_s3_client()
    for candidate in (key, "index.html"):
        try:
            obj = s3.get_object(Bucket=bucket, Key=candidate)
            raw = obj["Body"].read().decode("utf-8")
            ctype, _ = mimetypes.guess_type(candidate)
            if candidate.endswith(".js"):
                ctype = "application/javascript; charset=utf-8"
            elif candidate.endswith(".css"):
                ctype = "text/css; charset=utf-8"
            elif candidate.endswith(".html") or not ctype:
                ctype = "text/html; charset=utf-8"
            _ASSET_CACHE[candidate] = (raw, ctype)
            return {
                "statusCode": 200,
                "headers": {"Content-Type": ctype, "Cache-Control": "public, max-age=300"},
                "body": raw,
            }
        except ClientError:
            continue

    return _response(404, {"error": f"Static asset not found: {key}"})


def _response(status_code: int, body: Any) -> dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
        },
        "body": json.dumps(body),
    }


def _parse_body(event: dict[str, Any]) -> dict[str, Any]:
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        import base64

        raw = base64.b64decode(raw).decode("utf-8")
    return json.loads(raw) if isinstance(raw, str) else raw


def _compute_current_state(
    store: WorkspaceStore,
    user_id: str,
    month: str,
    source_filter: str = "all",
) -> dict[str, Any]:
    profile = store.get_profile(user_id)
    ledger = store.list_ledger_items(user_id, month=month)
    all_items = store.list_ledger_items(user_id)
    available_months = sorted({str(x.get("month")) for x in all_items if x.get("month")} | {month})
    snapshots = store.list_snapshots(user_id)
    prior_months = sorted({str(s.get("month")) for s in snapshots if s.get("month") and str(s.get("month")) < month})
    prior_ledger = store.list_ledger_items(user_id, month=prior_months[-1]) if prior_months else []
    analytics = analyze_finances(
        profile=profile,
        ledger_items=ledger,
        source_filter=source_filter,
        prior_snapshots=snapshots,
        month=month,
        prior_ledger_items=prior_ledger,
    )
    current_snap = next((s for s in snapshots if s.get("month") == month), None)
    return {
        "user_id": user_id,
        "month": month,
        "available_months": available_months,
        "profile": profile,
        "excel_mapping": store.get_excel_mapping(user_id),
        "uploaded_files": store.list_uploaded_files(user_id),
        "ledger": ledger,
        "analytics": analytics,
        "ai_advice": (current_snap or {}).get("ai_advice"),
        "chat_history": store.list_chat_history(user_id, limit=12),
    }


def lambda_handler(event: dict[str, Any], context: Any = None, store: WorkspaceStore | None = None) -> dict[str, Any]:
    """Handle API Gateway HTTP API v2 requests."""
    active_store = store or _STORE
    req_ctx = event.get("requestContext") or {}
    http_info = req_ctx.get("http") or {}
    method = str(http_info.get("method") or event.get("httpMethod") or "GET").upper()
    path = str(event.get("rawPath") or event.get("path") or "/api/health")
    query = event.get("queryStringParameters") or {}

    if method == "OPTIONS":
        return _response(200, {"ok": True})

    if not path.startswith("/api/"):
        return _serve_static_asset(path)

    try:
        if path.endswith("/api/health"):
            return _response(200, {"status": "ok", "service": "finwise-ai"})

        if path.endswith("/api/account/create") and method == "POST":
            body = _parse_body(event)
            raw_name = str(body.get("display_name") or body.get("user_id") or "").strip()
            if not raw_name:
                return _response(400, {"error": "Please enter a name or workspace ID."})
            user_id = "".join(c for c in raw_name.lower().replace(" ", "_") if c.isalnum() or c in ("_", "-"))[:32]
            if not user_id:
                return _response(400, {"error": "Workspace name must contain letters or numbers."})
            month = str(body.get("month") or "2026-11")
            active_store.reset_user(user_id)
            profile_payload = {
                "display_name": raw_name,
                "currency": str(body.get("currency") or "INR").upper(),
                "monthly_income": max(0.0, float(body.get("monthly_income", 0) or 0)),
                "current_savings": max(0.0, float(body.get("current_savings", 0) or 0)),
                "goal_name": str(body.get("goal_name") or "Emergency Fund"),
                "goal_target": max(0.0, float(body.get("goal_target", 0) or 0)),
                "preferred_input_mode": str(body.get("preferred_input_mode") or "portal"),
                "debts": [],
            }
            active_store.save_profile(user_id, profile_payload)
            return _response(200, _compute_current_state(active_store, user_id, month))

        if path.endswith("/api/workspace") and method == "GET":
            user_id = str(query.get("userId") or "aarav")
            month = str(query.get("month") or "2026-11")
            source_filter = str(query.get("source") or "all")
            return _response(200, _compute_current_state(active_store, user_id, month, source_filter))

        if path.endswith("/api/profile") and method == "POST":
            body = _parse_body(event)
            user_id = str(body.get("user_id") or "aarav")
            month = str(body.get("month") or "2026-11")
            profile_update = body.get("profile") or {}
            active_store.save_profile(user_id, profile_update)
            return _response(200, _compute_current_state(active_store, user_id, month))

        if path.endswith("/api/ingest/csv") and method == "POST":
            body = _parse_body(event)
            user_id = str(body.get("user_id") or "aarav")
            default_month = str(body.get("month") or "2026-11")
            csv_text = str(body.get("csv_text") or "")
            filename = str(body.get("filename") or f"bank_statement_{default_month}.csv")
            replace_existing = bool(body.get("replace_existing", True))

            items = parse_bank_csv(csv_text, default_month=default_month)
            if not items:
                return _response(400, {"error": "No valid transactions found in CSV."})

            by_month: dict[str, list[dict[str, Any]]] = {}
            for it in items:
                by_month.setdefault(it["month"], []).append(it)

            total_count = 0
            for m_key, m_items in by_month.items():
                replace_spec = (m_key, "bank_csv") if replace_existing else None
                total_count += active_store.upsert_ledger_items(user_id, m_items, replace_month_source=replace_spec)
                active_store.archive_raw_payload(user_id, m_key, "bank-csv", json.dumps(m_items))

            active_store.save_uploaded_file(
                user_id,
                {
                    "filename": filename,
                    "file_type": "bank_csv",
                    "months_covered": sorted(by_month.keys()),
                    "row_count": len(items),
                    "total_income": round(sum(i["amount"] for i in items if i["tx_type"] == "income"), 2),
                    "total_expense": round(sum(i["amount"] for i in items if i["tx_type"] == "expense"), 2),
                    "extracted_rows": items,
                },
            )

            target_month = sorted(by_month.keys())[-1]

            # Sync detected income to profile if profile income is empty
            profile = active_store.get_profile(user_id)
            latest_income = sum(i["amount"] for i in by_month[target_month] if i["tx_type"] == "income")
            if latest_income > 0 and float(profile.get("monthly_income", 0) or 0) == 0:
                active_store.save_profile(user_id, {"monthly_income": latest_income})

            # Save baseline snapshots for any earlier uploaded months so MoM history works immediately
            sorted_uploaded = sorted(by_month.keys())
            for earlier_m in sorted_uploaded[:-1]:
                early_state = _compute_current_state(active_store, user_id, earlier_m)
                active_store.save_snapshot(
                    user_id,
                    earlier_m,
                    early_state["analytics"],
                    _build_deterministic_fallback_strategy(early_state["analytics"]),
                )

            state = _compute_current_state(active_store, user_id, target_month)
            state["ingested_count"] = total_count
            return _response(200, state)

        if path.endswith("/api/ingest/excel") and method == "POST":
            body = _parse_body(event)
            user_id = str(body.get("user_id") or "aarav")
            default_month = str(body.get("month") or "2026-11")
            rows = body.get("rows") or []
            column_map = body.get("column_map") or {}
            sheet_name = str(body.get("sheet_name") or "Sheet1")
            filename = str(body.get("filename") or "budget.xlsx")
            save_mapping = bool(body.get("save_mapping", True))
            replace_existing = bool(body.get("replace_existing", True))

            items = normalize_excel_rows(rows, column_map, default_month=default_month, source="excel_import")
            if not items:
                return _response(400, {"error": "No valid rows extracted from Excel sheet with this column mapping."})

            if save_mapping:
                active_store.save_excel_mapping(
                    user_id,
                    {"sheet_name": sheet_name, "filename": filename, "column_map": column_map},
                )

            by_month: dict[str, list[dict[str, Any]]] = {}
            for it in items:
                by_month.setdefault(it["month"], []).append(it)

            total_count = 0
            for m_key, m_items in by_month.items():
                replace_spec = (m_key, "excel_import") if replace_existing else None
                total_count += active_store.upsert_ledger_items(user_id, m_items, replace_month_source=replace_spec)
                active_store.archive_raw_payload(user_id, m_key, "excel-import", json.dumps(m_items))

            active_store.save_uploaded_file(
                user_id,
                {
                    "filename": filename,
                    "file_type": "excel_import",
                    "sheet_name": sheet_name,
                    "column_mapping": column_map,
                    "months_covered": sorted(by_month.keys()),
                    "row_count": len(items),
                    "total_income": round(sum(i["amount"] for i in items if i["tx_type"] == "income"), 2),
                    "total_expense": round(sum(i["amount"] for i in items if i["tx_type"] == "expense"), 2),
                    "extracted_rows": items,
                },
            )

            target_month = sorted(by_month.keys())[-1]
            profile = active_store.get_profile(user_id)
            latest_income = sum(i["amount"] for i in by_month[target_month] if i["tx_type"] == "income")
            if latest_income > 0 and float(profile.get("monthly_income", 0) or 0) == 0:
                active_store.save_profile(user_id, {"monthly_income": latest_income})

            for earlier_m in sorted(by_month.keys())[:-1]:
                early_state = _compute_current_state(active_store, user_id, earlier_m)
                active_store.save_snapshot(
                    user_id,
                    earlier_m,
                    early_state["analytics"],
                    _build_deterministic_fallback_strategy(early_state["analytics"]),
                )

            state = _compute_current_state(active_store, user_id, target_month)
            state["ingested_count"] = total_count
            return _response(200, state)

        if path.endswith("/api/month/carry-forward") and method == "POST":
            body = _parse_body(event)
            user_id = str(body.get("user_id") or "aarav")
            source_month = str(body.get("source_month") or "")
            target_month = str(body.get("target_month") or "")
            if not target_month:
                return _response(400, {"error": "Target month is required."})

            # Save snapshot of source month before advancing so MoM delta works cleanly
            if source_month:
                src_state = _compute_current_state(active_store, user_id, source_month)
                active_store.save_snapshot(
                    user_id,
                    source_month,
                    src_state["analytics"],
                    src_state.get("ai_advice") or _build_deterministic_fallback_strategy(src_state["analytics"]),
                )
                src_items = active_store.list_ledger_items(user_id, month=source_month)
            else:
                src_items = []

            recurring_items = [
                it for it in src_items if it.get("recurring") or it.get("tx_type") == "income"
            ]
            existing_target = active_store.list_ledger_items(user_id, month=target_month)
            existing_names = {str(it.get("name", "")).lower() for it in existing_target}

            new_items = []
            for it in recurring_items:
                if str(it.get("name", "")).lower() in existing_names:
                    continue
                orig_date = str(it.get("date") or f"{target_month}-01")
                day_part = orig_date.split("-")[-1] if len(orig_date.split("-")) == 3 else "01"
                new_items.append(
                    {
                        **it,
                        "tx_id": str(uuid.uuid4())[:10],
                        "month": target_month,
                        "date": f"{target_month}-{day_part}",
                        "source": "portal_entry",
                    }
                )
            if new_items:
                active_store.upsert_ledger_items(user_id, new_items)

            state = _compute_current_state(active_store, user_id, target_month)
            state["carried_count"] = len(new_items)
            return _response(200, state)

        if path.endswith("/api/ledger") and method == "POST":
            body = _parse_body(event)
            user_id = str(body.get("user_id") or "aarav")
            month = str(body.get("month") or "2026-11")
            item = body.get("item") or {}

            name = str(item.get("name") or "").strip()
            amount = max(0.0, float(item.get("amount", 0) or 0))
            if not name or amount <= 0:
                return _response(400, {"error": "Ledger entry requires a valid name and positive amount."})

            tx_type = str(item.get("tx_type") or "expense").lower()
            explicit_cat = str(item.get("category") or "").strip()
            if tx_type == "income":
                category, bucket = "income", "income"
            else:
                category, bucket = classify_description(name, explicit_cat)

            tx_id = str(item.get("tx_id") or str(uuid.uuid4())[:10])
            normalized = {
                "tx_id": tx_id,
                "date": str(item.get("date") or f"{month}-01"),
                "month": month,
                "name": name,
                "category": category,
                "bucket": str(item.get("bucket") or bucket),
                "amount": round(amount, 2),
                "tx_type": tx_type,
                "source": str(item.get("source") or "portal_entry"),
                "recurring": bool(item.get("recurring", False)),
            }
            active_store.upsert_ledger_items(user_id, [normalized])
            return _response(200, _compute_current_state(active_store, user_id, month))

        if path.endswith("/api/ledger") and method == "DELETE":
            user_id = str(query.get("userId") or "aarav")
            month = str(query.get("month") or "2026-11")
            tx_id = query.get("txId")
            if tx_id:
                active_store.delete_ledger_item(user_id, month, str(tx_id))
            return _response(200, _compute_current_state(active_store, user_id, month))

        if path.endswith("/api/analyze") and method == "POST":
            body = _parse_body(event)
            user_id = str(body.get("user_id") or "aarav")
            month = str(body.get("month") or "2026-11")
            source_filter = str(body.get("source") or "all")

            state = _compute_current_state(active_store, user_id, month, source_filter)
            ai_advice = generate_financial_strategy(
                state["analytics"],
                user_id=user_id,
                ledger_items=state["ledger"],
                uploaded_files=state["uploaded_files"],
            )
            active_store.save_snapshot(user_id, month, state["analytics"], ai_advice)

            updated = _compute_current_state(active_store, user_id, month, source_filter)
            updated["ai_advice"] = ai_advice
            return _response(200, updated)

        if path.endswith("/api/chat") and method == "POST":
            body = _parse_body(event)
            user_id = str(body.get("user_id") or "aarav")
            month = str(body.get("month") or "2026-11")
            question = str(body.get("question") or "").strip()
            if not question:
                return _response(400, {"error": "Question cannot be empty."})

            state = _compute_current_state(active_store, user_id, month)
            result = chat_with_coach(
                question=question,
                analytics=state["analytics"],
                chat_history=state["chat_history"],
                user_id=user_id,
                ledger_items=state["ledger"],
                uploaded_files=state["uploaded_files"],
            )
            active_store.append_chat_turn(user_id, "user", question)
            active_store.append_chat_turn(user_id, "assistant", result["reply"])

            return _response(
                200,
                {
                    "reply": result["reply"],
                    "mode": result["mode"],
                    "model_id": result["model_id"],
                    "chat_history": active_store.list_chat_history(user_id, limit=12),
                },
            )

        if path.endswith("/api/demo/load") and method == "POST":
            body = _parse_body(event)
            persona = str(body.get("persona") or "aarav")
            user_id = str(body.get("user_id") or persona)
            bundle = get_demo_bundle(persona)

            active_store.reset_user(user_id)
            active_store.save_profile(user_id, bundle["profile"])
            active_store.save_excel_mapping(user_id, bundle["excel_mapping"])

            months_data = bundle["months"]
            sorted_months = sorted(months_data.keys())
            all_csv_rows: list[dict[str, Any]] = []
            all_excel_rows: list[dict[str, Any]] = []
            for m in sorted_months:
                active_store.upsert_ledger_items(user_id, months_data[m])
                all_csv_rows.extend([it for it in months_data[m] if it.get("source") == "bank_csv"])
                all_excel_rows.extend([it for it in months_data[m] if it.get("source") == "excel_import"])

            if all_csv_rows:
                active_store.save_uploaded_file(
                    user_id,
                    {
                        "filename": f"{persona}_bank_statement.csv",
                        "file_type": "bank_csv",
                        "months_covered": sorted_months,
                        "row_count": len(all_csv_rows),
                        "total_income": round(sum(i["amount"] for i in all_csv_rows if i["tx_type"] == "income"), 2),
                        "total_expense": round(sum(i["amount"] for i in all_csv_rows if i["tx_type"] == "expense"), 2),
                        "extracted_rows": all_csv_rows,
                    },
                )
            if all_excel_rows:
                active_store.save_uploaded_file(
                    user_id,
                    {
                        "filename": bundle["excel_mapping"].get("filename", f"{persona}_expenses.xlsx"),
                        "file_type": "excel_import",
                        "sheet_name": bundle["excel_mapping"].get("sheet_name", "Expenses_2026"),
                        "column_mapping": bundle["excel_mapping"].get("column_map"),
                        "months_covered": sorted_months,
                        "row_count": len(all_excel_rows),
                        "total_income": round(sum(i["amount"] for i in all_excel_rows if i["tx_type"] == "income"), 2),
                        "total_expense": round(sum(i["amount"] for i in all_excel_rows if i["tx_type"] == "expense"), 2),
                        "extracted_rows": all_excel_rows,
                    },
                )

            # Pre-seed prior month(s) snapshot so historical MoM deltas work immediately
            prior_snaps: list[dict[str, Any]] = []
            for m in sorted_months[:-1]:
                m_analytics = analyze_finances(
                    profile=bundle["profile"],
                    ledger_items=months_data[m],
                    prior_snapshots=prior_snaps,
                    month=m,
                )
                m_advice = _build_deterministic_fallback_strategy(m_analytics)
                snap = active_store.save_snapshot(user_id, m, m_analytics, m_advice)
                prior_snaps.append(snap)

            latest_month = sorted_months[-1]
            state = _compute_current_state(active_store, user_id, latest_month)
            latest_advice = generate_financial_strategy(
                state["analytics"],
                user_id=user_id,
                ledger_items=state["ledger"],
                uploaded_files=state["uploaded_files"],
            )
            active_store.save_snapshot(user_id, latest_month, state["analytics"], latest_advice)
            return _response(200, _compute_current_state(active_store, user_id, latest_month))

        if path.endswith("/api/export") and method == "GET":
            user_id = str(query.get("userId") or "aarav")
            return _response(200, active_store.export_workspace(user_id))

        if path.endswith("/api/import") and method == "POST":
            body = _parse_body(event)
            user_id = str(body.get("user_id") or "aarav")
            bundle = body.get("bundle") or {}
            active_store.import_workspace(user_id, bundle)
            month = str(body.get("month") or "2026-11")
            return _response(200, _compute_current_state(active_store, user_id, month))

        return _response(404, {"error": f"Route not found: {method} {path}"})
    except ValueError as exc:
        return _response(400, {"error": str(exc)})
    except Exception as exc:
        logger.exception("Unhandled error")
        return _response(500, {"error": f"Internal server error: {exc}"})
