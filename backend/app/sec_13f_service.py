"""Small SEC EDGAR client for Form 13F holdings.

SEC is the source of record here.  Market prices are intentionally not mixed into
this module; the caller may enrich reported holdings with the project's price
service, but must preserve the filing date and source URL.
"""
from __future__ import annotations

import gzip
import json
import re
import time
import urllib.request
import xml.etree.ElementTree as ET
from typing import Any

SEC_BASE = "https://www.sec.gov"
DATA_BASE = "https://data.sec.gov"
USER_AGENT = "portfolio-tracker research admin@example.com"


def _request_json(url: str) -> dict[str, Any]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate"})
    with urllib.request.urlopen(req, timeout=20) as response:
        payload = response.read()
        if payload[:2] == b"\x1f\x8b":
            payload = gzip.decompress(payload)
        return json.loads(payload.decode("utf-8"))


def _request_text(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate"})
    with urllib.request.urlopen(req, timeout=20) as response:
        payload = response.read()
        if payload[:2] == b"\x1f\x8b":
            payload = gzip.decompress(payload)
        return payload.decode("utf-8", errors="replace")


def build_filing_url(cik: str, accession_number: str, filename: str) -> str:
    cik_digits = str(int(cik))
    accession_path = accession_number.replace("-", "")
    return f"{SEC_BASE}/Archives/edgar/data/{cik_digits}/{accession_path}/{filename}"


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _child_text(node: ET.Element, name: str, default: str = "") -> str:
    for child in node.iter():
        if _local_name(child.tag) == name:
            return (child.text or "").strip()
    return default


def parse_information_table(xml_text: str, filing_period: str) -> list[dict[str, Any]]:
    root = ET.fromstring(xml_text)
    rows: list[dict[str, Any]] = []
    for node in root.iter():
        if _local_name(node.tag) != "infoTable":
            continue
        value = float(_child_text(node, "value", "0") or 0) * 1000
        shares = float(_child_text(node, "sshPrnamt", "0") or 0)
        rows.append({
            "issuer": _child_text(node, "nameOfIssuer"),
            "cusip": _child_text(node, "cusip"),
            "title_of_class": _child_text(node, "titleOfClass"),
            "reported_value_usd": value,
            "shares": shares,
            "share_type": _child_text(node, "sshPrnamtType") or None,
            "put_call": _child_text(node, "putCall") or None,
            "filing_period": filing_period,
        })
    return rows


def _find_information_document(cik: str, accession_number: str) -> str:
    url = build_filing_url(cik, accession_number, "index.json")
    index = _request_json(url)
    files = index.get("directory", {}).get("item", [])
    candidates = [
        str(item.get("name")) for item in files
        if str(item.get("name", "")).lower().endswith(".xml")
        and str(item.get("name", "")).lower() not in {"primary_doc.xml", "primary-document.xml"}
    ]
    if not candidates:
        raise ValueError(f"SEC filing has no information-table XML: {accession_number}")
    # Information tables are normally the numeric XML document; prefer it over
    # the XSL presentation document or cover document.
    candidates.sort(key=lambda name: (not bool(re.fullmatch(r"\d+\.xml", name, re.I)), name))
    return candidates[0]


def fetch_13f_filings(cik: str, limit: int = 2) -> list[dict[str, Any]]:
    cik_padded = str(cik).zfill(10)
    data = _request_json(f"{DATA_BASE}/submissions/CIK{cik_padded}.json")
    recent = data.get("filings", {}).get("recent", {})
    filings: list[dict[str, Any]] = []
    for i, form in enumerate(recent.get("form", [])):
        if form != "13F-HR":
            continue
        filings.append({
            "cik": cik_padded,
            "manager_name": data.get("name", ""),
            "accession_number": recent["accessionNumber"][i],
            "filing_date": recent["filingDate"][i],
            "reporting_period": recent["reportDate"][i],
            "primary_document": recent["primaryDocument"][i],
        })
        if len(filings) >= limit:
            break
    if not filings:
        raise ValueError(f"No 13F-HR filing found for CIK {cik_padded}")
    return filings


def fetch_latest_13f(cik: str) -> dict[str, Any]:
    return fetch_13f_filings(cik, limit=1)[0]


def fetch_filing_rows(filing: dict[str, Any]) -> list[dict[str, Any]]:
    filename = _find_information_document(filing["cik"], filing["accession_number"])
    url = build_filing_url(filing["cik"], filing["accession_number"], filename)
    rows = parse_information_table(_request_text(url), filing["reporting_period"])
    for row in rows:
        row["source_url"] = url
        row["accession_number"] = filing["accession_number"]
        row["filing_date"] = filing["filing_date"]
    return rows
