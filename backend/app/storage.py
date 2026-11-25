"""DynamoDB single-table persistence with graceful in-memory fallback for local testing."""

from __future__ import annotations

import json
import os
import time
import uuid
from decimal import Decimal
from typing import Any

import boto3
from boto3.dynamodb.conditions import Key


def _to_ddb(obj: Any) -> Any:
    if isinstance(obj, float):
        return Decimal(str(round(obj, 4)))
    if isinstance(obj, dict):
        return {k: _to_ddb(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_to_ddb(v) for v in obj]
    return obj


def _from_ddb(obj: Any) -> Any:
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    if isinstance(obj, dict):
        return {k: _from_ddb(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_from_ddb(v) for v in obj]
    return obj


DEFAULT_PROFILE: dict[str, Any] = {
    "display_name": "",
    "currency": "INR",
    "monthly_income": 0.0,
    "secondary_income": 0.0,
    "current_savings": 0.0,
    "goal_name": "6-Month Emergency Fund",
    "goal_target": 0.0,
    "risk_tolerance": "moderate",
    "income_stability": "stable",
    "preferred_input_mode": "portal",
    "debts": [],
}


class WorkspaceStore:
    """Persists user profiles, saved Excel column mappings, unified ledger transactions, monthly snapshots, and chat memory."""

    def __init__(self, table_name: str | None = None, archive_bucket: str | None = None) -> None:
        self._table_name = table_name if table_name is not None else os.environ.get("TABLE_NAME", "")
        self._archive_bucket = archive_bucket if archive_bucket is not None else os.environ.get("ARCHIVE_BUCKET", "")
        self._table = boto3.resource("dynamodb").Table(self._table_name) if self._table_name else None
        self._s3 = boto3.client("s3") if self._archive_bucket else None
        self._mem: dict[str, dict[str, Any]] = {}

    def _pk(self, user_id: str) -> str:
        return f"USER#{user_id.strip().lower()}"

    def archive_raw_payload(self, user_id: str, month: str, kind: str, content: str) -> None:
        if self._s3 is None or not self._archive_bucket:
            return
        key = f"archives/{user_id.strip().lower()}/{month}/{int(time.time())}-{kind}.json"
        self._s3.put_object(
            Bucket=self._archive_bucket,
            Key=key,
            Body=content.encode("utf-8"),
            ContentType="application/json",
        )

    def get_profile(self, user_id: str) -> dict[str, Any]:
        pk = self._pk(user_id)
        if self._table is None:
            return dict(self._mem.get(pk, {}).get("PROFILE", DEFAULT_PROFILE))

        resp = self._table.get_item(Key={"pk": pk, "sk": "PROFILE"})
        item = resp.get("Item")
        if not item:
            return dict(DEFAULT_PROFILE)
        data = _from_ddb(item)
        return {**DEFAULT_PROFILE, **(data.get("profile") or {})}

    def save_profile(self, user_id: str, profile: dict[str, Any]) -> dict[str, Any]:
        pk = self._pk(user_id)
        merged = {**self.get_profile(user_id), **profile}
        if self._table is None:
            self._mem.setdefault(pk, {})["PROFILE"] = merged
            return merged

        self._table.put_item(
            Item=_to_ddb({"pk": pk, "sk": "PROFILE", "profile": merged, "updated_at": int(time.time())})
        )
        return merged

    def get_excel_mapping(self, user_id: str) -> dict[str, Any] | None:
        pk = self._pk(user_id)
        if self._table is None:
            return self._mem.get(pk, {}).get("EXCELMAP")

        resp = self._table.get_item(Key={"pk": pk, "sk": "EXCELMAP"})
        item = resp.get("Item")
        return _from_ddb(item.get("mapping")) if item else None

    def save_excel_mapping(self, user_id: str, mapping: dict[str, Any]) -> dict[str, Any]:
        pk = self._pk(user_id)
        saved = {**mapping, "updated_at": int(time.time())}
        if self._table is None:
            self._mem.setdefault(pk, {})["EXCELMAP"] = saved
            return saved

        self._table.put_item(Item=_to_ddb({"pk": pk, "sk": "EXCELMAP", "mapping": saved}))
        return saved

    def save_uploaded_file(self, user_id: str, record: dict[str, Any]) -> dict[str, Any]:
        pk = self._pk(user_id)
        file_id = str(record.get("file_id") or str(uuid.uuid4())[:10])
        ts = int(record.get("uploaded_at") or time.time())
        stored = {
            "file_id": file_id,
            "filename": str(record.get("filename") or "upload"),
            "file_type": str(record.get("file_type") or "bank_csv"),
            "uploaded_at": ts,
            "months_covered": list(record.get("months_covered") or []),
            "row_count": int(record.get("row_count") or 0),
            "total_income": float(record.get("total_income") or 0),
            "total_expense": float(record.get("total_expense") or 0),
            "column_mapping": record.get("column_mapping"),
            "sheet_name": record.get("sheet_name"),
            "extracted_rows": list(record.get("extracted_rows") or [])[:150],
        }
        if self._table is None:
            files = self._mem.setdefault(pk, {}).setdefault("FILES", {})
            files[file_id] = stored
            return stored

        sk = f"FILE#{ts}#{file_id}"
        self._table.put_item(Item=_to_ddb({"pk": pk, "sk": sk, **stored}))
        return stored

    def list_uploaded_files(self, user_id: str) -> list[dict[str, Any]]:
        pk = self._pk(user_id)
        if self._table is None:
            files = list(self._mem.get(pk, {}).get("FILES", {}).values())
            files.sort(key=lambda x: int(x.get("uploaded_at", 0)), reverse=True)
            return files

        resp = self._table.query(
            KeyConditionExpression=Key("pk").eq(pk) & Key("sk").begins_with("FILE#"),
            ScanIndexForward=False,
        )
        results = []
        for raw in resp.get("Items", []):
            item = _from_ddb(raw)
            item.pop("pk", None)
            item.pop("sk", None)
            results.append(item)
        return results

    def upsert_ledger_items(self, user_id: str, items: list[dict[str, Any]], replace_month_source: tuple[str, str] | None = None) -> int:
        pk = self._pk(user_id)
        if replace_month_source:
            month, source = replace_month_source
            self.delete_ledger_by_source(user_id, month, source)

        if self._table is None:
            tx_map = self._mem.setdefault(pk, {}).setdefault("TXNS", {})
            for item in items:
                sk = f"TXN#{item['month']}#{item['tx_id']}"
                tx_map[sk] = dict(item)
            return len(items)

        with self._table.batch_writer() as batch:
            for item in items:
                sk = f"TXN#{item['month']}#{item['tx_id']}"
                batch.put_item(Item=_to_ddb({"pk": pk, "sk": sk, **item}))
        return len(items)

    def delete_ledger_by_source(self, user_id: str, month: str, source: str) -> int:
        existing = self.list_ledger_items(user_id, month=month)
        to_delete = [x for x in existing if x.get("source") == source]
        pk = self._pk(user_id)
        if self._table is None:
            tx_map = self._mem.get(pk, {}).get("TXNS", {})
            for item in to_delete:
                tx_map.pop(f"TXN#{item['month']}#{item['tx_id']}", None)
            return len(to_delete)

        with self._table.batch_writer() as batch:
            for item in to_delete:
                batch.delete_item(Key={"pk": pk, "sk": f"TXN#{item['month']}#{item['tx_id']}"})
        return len(to_delete)

    def delete_ledger_item(self, user_id: str, month: str, tx_id: str) -> None:
        pk = self._pk(user_id)
        sk = f"TXN#{month}#{tx_id}"
        if self._table is None:
            self._mem.get(pk, {}).get("TXNS", {}).pop(sk, None)
            return
        self._table.delete_item(Key={"pk": pk, "sk": sk})

    def list_ledger_items(self, user_id: str, month: str | None = None) -> list[dict[str, Any]]:
        pk = self._pk(user_id)
        prefix = f"TXN#{month}#" if month else "TXN#"
        if self._table is None:
            tx_map = self._mem.get(pk, {}).get("TXNS", {})
            rows = [dict(v) for k, v in tx_map.items() if k.startswith(prefix)]
            rows.sort(key=lambda x: (str(x.get("date", "")), str(x.get("name", ""))), reverse=True)
            return rows

        dynamodb = self._table.meta.client
        paginator = dynamodb.get_paginator("query")
        rows: list[dict[str, Any]] = []
        for page in paginator.paginate(
            TableName=self._table_name,
            KeyConditionExpression="pk = :pk AND begins_with(sk, :prefix)",
            ExpressionAttributeValues={":pk": pk, ":prefix": prefix},
        ):
            for raw in page.get("Items", []):
                item = _from_ddb(raw)
                item.pop("pk", None)
                item.pop("sk", None)
                rows.append(item)
        rows.sort(key=lambda x: (str(x.get("date", "")), str(x.get("name", ""))), reverse=True)
        return rows

    def save_snapshot(
        self,
        user_id: str,
        month: str,
        analytics: dict[str, Any],
        ai_advice: dict[str, Any],
    ) -> dict[str, Any]:
        pk = self._pk(user_id)
        sk = f"SNAP#{month}"
        record = {
            "month": month,
            "updated_at": int(time.time()),
            "analytics": analytics,
            "ai_advice": ai_advice,
        }
        if self._table is None:
            self._mem.setdefault(pk, {}).setdefault("SNAPS", {})[month] = record
            return record

        self._table.put_item(Item=_to_ddb({"pk": pk, "sk": sk, **record}))
        return record

    def list_snapshots(self, user_id: str) -> list[dict[str, Any]]:
        pk = self._pk(user_id)
        if self._table is None:
            snaps = list(self._mem.get(pk, {}).get("SNAPS", {}).values())
            snaps.sort(key=lambda x: str(x.get("month", "")))
            return snaps

        resp = self._table.query(
            KeyConditionExpression=Key("pk").eq(pk) & Key("sk").begins_with("SNAP#"),
            ScanIndexForward=True,
        )
        results = []
        for raw in resp.get("Items", []):
            item = _from_ddb(raw)
            item.pop("pk", None)
            item.pop("sk", None)
            results.append(item)
        return results

    def append_chat_turn(self, user_id: str, role: str, text: str) -> None:
        pk = self._pk(user_id)
        ts = int(time.time() * 1000)
        turn = {"role": role, "text": text, "ts": ts}
        if self._table is None:
            chats = self._mem.setdefault(pk, {}).setdefault("CHATS", [])
            chats.append(turn)
            self._mem[pk]["CHATS"] = chats[-20:]
            return

        sk = f"CHAT#{ts}#{str(uuid.uuid4())[:6]}"
        self._table.put_item(Item=_to_ddb({"pk": pk, "sk": sk, **turn}))

    def list_chat_history(self, user_id: str, limit: int = 12) -> list[dict[str, Any]]:
        pk = self._pk(user_id)
        if self._table is None:
            return list(self._mem.get(pk, {}).get("CHATS", []))[-limit:]

        resp = self._table.query(
            KeyConditionExpression=Key("pk").eq(pk) & Key("sk").begins_with("CHAT#"),
            ScanIndexForward=False,
            Limit=limit,
        )
        items = [_from_ddb(r) for r in resp.get("Items", [])]
        items.reverse()
        return [{"role": i["role"], "text": i["text"], "ts": i.get("ts", 0)} for i in items]

    def reset_user(self, user_id: str) -> None:
        pk = self._pk(user_id)
        if self._table is None:
            self._mem.pop(pk, None)
            return

        resp = self._table.query(
            KeyConditionExpression=Key("pk").eq(pk),
            ProjectionExpression="pk, sk",
        )
        with self._table.batch_writer() as batch:
            for item in resp.get("Items", []):
                batch.delete_item(Key={"pk": item["pk"], "sk": item["sk"]})

    def export_workspace(self, user_id: str) -> dict[str, Any]:
        return {
            "user_id": user_id,
            "profile": self.get_profile(user_id),
            "excel_mapping": self.get_excel_mapping(user_id),
            "uploaded_files": self.list_uploaded_files(user_id),
            "ledger": self.list_ledger_items(user_id),
            "snapshots": self.list_snapshots(user_id),
            "chat_history": self.list_chat_history(user_id, limit=20),
        }

    def import_workspace(self, user_id: str, bundle: dict[str, Any]) -> None:
        self.reset_user(user_id)
        if bundle.get("profile"):
            self.save_profile(user_id, bundle["profile"])
        if bundle.get("excel_mapping"):
            self.save_excel_mapping(user_id, bundle["excel_mapping"])
        for uf in bundle.get("uploaded_files") or []:
            self.save_uploaded_file(user_id, uf)
        if bundle.get("ledger"):
            self.upsert_ledger_items(user_id, bundle["ledger"])
        for snap in bundle.get("snapshots") or []:
            self.save_snapshot(user_id, snap["month"], snap["analytics"], snap["ai_advice"])
        for msg in bundle.get("chat_history") or []:
            self.append_chat_turn(user_id, msg["role"], msg["text"])
