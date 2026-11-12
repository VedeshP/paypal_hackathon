"""Tiny SQLite document store + in-process pub/sub for live run events."""
from __future__ import annotations

import asyncio
import json
import sqlite3
import threading
import time
import uuid
from collections import defaultdict
from pathlib import Path
from typing import Any

from app.config import get_settings

_TABLES = ("mandates", "runs", "events", "purchases", "approvals", "users")


class Store:
    def __init__(self, path: str):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._lock = threading.Lock()
        with self._lock:
            for t in _TABLES:
                self._db.execute(
                    f"CREATE TABLE IF NOT EXISTS {t} (id TEXT PRIMARY KEY, ts REAL, ref TEXT, doc TEXT)"
                )
                self._db.execute(f"CREATE INDEX IF NOT EXISTS {t}_ref ON {t}(ref)")
            self._db.commit()

    def put(self, table: str, doc: dict[str, Any], ref: str | None = None) -> dict[str, Any]:
        doc.setdefault("id", f"{table[:3]}_{uuid.uuid4().hex[:12]}")
        doc.setdefault("ts", time.time())
        with self._lock:
            self._db.execute(
                f"INSERT OR REPLACE INTO {table} (id, ts, ref, doc) VALUES (?,?,?,?)",
                (doc["id"], doc["ts"], ref, json.dumps(doc, default=str)),
            )
            self._db.commit()
        return doc

    def get(self, table: str, id_: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._db.execute(f"SELECT doc FROM {table} WHERE id=?", (id_,)).fetchone()
        return json.loads(row[0]) if row else None

    def list(self, table: str, ref: str | None = None, limit: int = 500) -> list[dict[str, Any]]:
        q = f"SELECT doc FROM {table}" + (" WHERE ref=?" if ref else "") + " ORDER BY ts DESC LIMIT ?"
        args = (ref, limit) if ref else (limit,)
        with self._lock:
            rows = self._db.execute(q, args).fetchall()
        return [json.loads(r[0]) for r in rows]


class Bus:
    """Fan-out of run events to SSE subscribers."""

    def __init__(self):
        self._subs: dict[str, list[asyncio.Queue]] = defaultdict(list)

    def subscribe(self, key: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        self._subs[key].append(q)
        return q

    def unsubscribe(self, key: str, q: asyncio.Queue) -> None:
        if q in self._subs.get(key, []):
            self._subs[key].remove(q)

    def publish(self, key: str, event: dict[str, Any]) -> None:
        for q in list(self._subs.get(key, [])) + list(self._subs.get("*", [])):
            q.put_nowait(event)


store = Store(get_settings().db_path)
bus = Bus()
