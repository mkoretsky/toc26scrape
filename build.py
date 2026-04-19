#!/usr/bin/env python3
"""Build the static site data bundle.

Reads:  docs.db (+ doc_detail), records.json, drive_links.json, categories.json
Writes: /workspace/site/data.json — a single file the frontend consumes.

Run:    python3 /workspace/site/build.py
"""
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = Path(__file__).resolve().parent

DB_PATH = ROOT / "tagging" / "docs.db"
CATEGORIES_PATH = ROOT / "ui" / "categories.json"
RECORDS_PATH = ROOT / "ui" / "records.json"
DRIVE_LINKS_PATH = ROOT / "drive_links.json"

records = json.loads(RECORDS_PATH.read_text()) if RECORDS_PATH.exists() else {}
drive = json.loads(DRIVE_LINKS_PATH.read_text()) if DRIVE_LINKS_PATH.exists() else {}
categories = json.loads(CATEGORIES_PATH.read_text())

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row

# Per-doc tag lists
tags_by_file = {}
for row in conn.execute("SELECT file, tag, role FROM doc_tags"):
    d = tags_by_file.setdefault(row["file"], {"main": [], "response": []})
    d[row["role"]].append(row["tag"])

# Per-doc detail (scenario_chain + notes) — only populated for top-30 teams
detail_by_file = {}
for row in conn.execute("SELECT file, scenario_chain, notes FROM doc_detail"):
    detail_by_file[row["file"]] = {
        "scenario": row["scenario_chain"],
        "notes": row["notes"],
    }

# Build docs. Drop path column (leaks filesystem); derive open URL from drive_links.
docs = []
for row in conn.execute(
    "SELECT file, school, team, side, tournament, round_id FROM docs ORDER BY team, tournament, round_id"
):
    file = row["file"]
    t = tags_by_file.get(file, {"main": [], "response": []})
    docs.append({
        "file": file,
        "school": row["school"],
        "team": row["team"],
        "side": row["side"] or "unknown",
        "tournament": row["tournament"],
        "round_id": row["round_id"],
        "main_tags": sorted(set(t["main"])),
        "response_tags": sorted(set(t["response"])),
        "record": records.get(row["team"] or ""),
        "drive_url": drive.get(file),
        "detail": detail_by_file.get(file),
    })

# Category tree with counts (distinct files per tag)
counts = {}
for row in conn.execute("SELECT tag, COUNT(DISTINCT file) AS n FROM doc_tags GROUP BY tag"):
    counts[row["tag"]] = row["n"]

tree = []
assigned = set()
for cat, tags in categories.items():
    entries = []
    for t in tags:
        entries.append({"tag": t, "count": counts.get(t, 0)})
        assigned.add(t)
    entries.sort(key=lambda e: -e["count"])
    tree.append({"category": cat, "tags": entries})

# Catch any tag in the DB that's missing from categories.json
uncategorized = sorted(set(counts) - assigned)
if uncategorized:
    tree.append({
        "category": "Other",
        "tags": [{"tag": t, "count": counts[t]} for t in uncategorized],
    })

bundle = {
    "total_docs": len(docs),
    "tree": tree,
    "docs": docs,
}

out = SITE / "data.json"
out.write_text(json.dumps(bundle, ensure_ascii=False))  # no indent — keep small
print(f"wrote {out}  ({out.stat().st_size // 1024} KB)")
print(f"  docs: {len(docs)}")
print(f"  tree categories: {len(tree)}")
print(f"  docs with drive_url:   {sum(1 for d in docs if d['drive_url'])}/{len(docs)}")
print(f"  docs with record:      {sum(1 for d in docs if d['record'])}/{len(docs)}")
print(f"  docs with detail:      {sum(1 for d in docs if d['detail'])}/{len(docs)}")
conn.close()
