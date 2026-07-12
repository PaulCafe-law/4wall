from __future__ import annotations

from dataclasses import dataclass
import re
import unicodedata
from urllib.parse import urlsplit, urlunsplit

from app.line_floorplan.layout import FloorplanLayout, MachineLayout


QUERY_INTENTS = frozenset({"floorplan", "machines", "machine_detail", "gauges", "daily_incidents"})
NAVIGATION_INTENTS = frozenset({"project_progress", "people_portal", "official_site", "contact_us"})
ALLOWED_INTENTS = QUERY_INTENTS | NAVIGATION_INTENTS

_EXACT_INTENTS = {
    "廠區圖": "floorplan",
    "floorplan": "floorplan",
    "2d圖": "floorplan",
    "機台": "machines",
    "machines": "machines",
    "找機台": "machines",
    "儀表": "gauges",
    "gauges": "gauges",
    "異常": "daily_incidents",
    "今日異常": "daily_incidents",
    "daily_incidents": "daily_incidents",
    "檢視工程進度": "project_progress",
    "工程進度": "project_progress",
    "前往官網": "official_site",
    "官網": "official_site",
    "找人": "people_portal",
    "聯絡我們": "contact_us",
}

_INTENT_PATTERNS = {
    "floorplan": ("廠區圖", "2d圖", "平面圖", "廠區地圖", "工廠地圖", "floorplan"),
    "machines": ("機台", "機器", "設備", "machines"),
    "gauges": ("儀表", "讀值", "電流", "壓力", "流量", "gauges"),
    "daily_incidents": ("異常", "警報", "告警", "故障", "alarm", "incidents"),
    "project_progress": ("工程進度", "施工進度", "目前進度", "專案進度"),
    "people_portal": ("找人", "人員在哪", "人在哪", "人員位置", "現場有人"),
    "official_site": ("官網", "官方網站"),
    "contact_us": ("聯絡我們", "聯絡方式", "客服", "信箱", "email"),
}

_NEGATED_CAPABILITY_RE = re.compile(
    r"(?:不要|不用|別|無需).{0,6}(?:廠區圖|2d圖|機台|機器|設備|儀表|異常|警報|進度|官網|網站|找人|聯絡)"
)
_MACHINE_CANDIDATE_RE = re.compile(r"(?<![a-z0-9])(?:m[-_ ]?)?hc\d+(?:[-_ ]?\d{1,3})?(?![a-z0-9])")
_PUNCTUATION_RE = re.compile(r"[\s\u3000,，。.!！?？:：;；、/\\|()（）\[\]{}「」『』]+")


@dataclass(frozen=True)
class ParsedLineIntent:
    intent: str | None
    machine_candidate: str | None = None
    matched_intents: tuple[str, ...] = ()
    reason: str = "matched"


@dataclass(frozen=True)
class MachineResolution:
    status: str
    machine: MachineLayout | None = None


def parse_line_intent(text: str, *, natural_language_enabled: bool) -> ParsedLineIntent:
    normalized = normalize_line_text(text)
    if not normalized:
        return ParsedLineIntent(intent=None, reason="empty")

    exact = _EXACT_INTENTS.get(normalized)
    if exact is not None:
        return ParsedLineIntent(intent=exact, matched_intents=(exact,))

    if normalized.startswith("機台 "):
        candidate = normalized.split(" ", 1)[1].strip()
        return ParsedLineIntent(
            intent="machine_detail" if candidate else None,
            machine_candidate=candidate or None,
            matched_intents=("machine_detail",) if candidate else (),
            reason="matched" if candidate else "missing_machine_candidate",
        )

    if not natural_language_enabled:
        return ParsedLineIntent(intent=None, reason="natural_language_disabled")
    if _NEGATED_CAPABILITY_RE.search(normalized):
        return ParsedLineIntent(intent=None, reason="negated")

    machine_candidate = _machine_candidate(normalized)
    matches = {
        intent
        for intent, patterns in _INTENT_PATTERNS.items()
        if any(pattern in normalized for pattern in patterns)
    }

    if machine_candidate:
        navigation_matches = matches & NAVIGATION_INTENTS
        floorplan_match = "floorplan" in matches
        if navigation_matches or floorplan_match:
            matches.add("machine_detail")
        else:
            return ParsedLineIntent(
                intent="machine_detail",
                machine_candidate=machine_candidate,
                matched_intents=("machine_detail",),
            )

    ordered = tuple(sorted(matches))
    if len(ordered) == 1:
        return ParsedLineIntent(intent=ordered[0], matched_intents=ordered)
    if len(ordered) > 1:
        return ParsedLineIntent(
            intent=None,
            machine_candidate=machine_candidate,
            matched_intents=ordered,
            reason="ambiguous",
        )
    return ParsedLineIntent(intent=None, machine_candidate=machine_candidate, reason="unsupported")


def resolve_machine_candidate(layout: FloorplanLayout, candidate: str) -> MachineResolution:
    normalized_candidate = normalize_machine_reference(candidate)
    if not normalized_candidate:
        return MachineResolution(status="not_found")

    matches: dict[str, MachineLayout] = {}
    for machine in layout.machines:
        aliases = {
            normalize_machine_reference(machine.id),
            normalize_machine_reference(machine.label),
        }
        if machine.id.lower().startswith("m-"):
            aliases.add(normalize_machine_reference(machine.id[2:]))
        if normalized_candidate in aliases:
            matches[machine.id] = machine
    if not matches:
        return MachineResolution(status="not_found")
    if len(matches) > 1:
        return MachineResolution(status="ambiguous")
    return MachineResolution(status="resolved", machine=next(iter(matches.values())))


def safe_line_navigation_url(settings, path: str, *, fragment: str = "") -> str | None:
    origin = str(settings.app_origin or "").strip()
    if not origin or not path.startswith("/") or path.startswith("//"):
        return None
    try:
        parsed = urlsplit(origin)
        port = parsed.port
    except ValueError:
        return None
    environment = str(settings.environment or "").lower()
    is_development = environment in {"development", "dev", "test"}
    if parsed.scheme != "https" and not (is_development and parsed.scheme == "http"):
        return None
    if not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        return None
    if parsed.path not in {"", "/"}:
        return None
    if not is_development and port not in {None, 443}:
        return None
    allowed_hosts = {host.strip().lower() for host in settings.line_navigation_allowed_hosts if host.strip()}
    if parsed.hostname.lower() not in allowed_hosts:
        return None
    normalized_path = "/" + "/".join(part for part in path.split("/") if part)
    if path.endswith("/") and normalized_path != "/":
        normalized_path += "/"
    return urlunsplit((parsed.scheme, parsed.netloc, normalized_path, "", fragment))


def normalize_line_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", str(text or "")).strip().lower()
    normalized = _PUNCTUATION_RE.sub(" ", normalized)
    return " ".join(normalized.split())


def normalize_machine_reference(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", str(value or "")).strip().lower()
    normalized = re.sub(r"[_\s]+", "-", normalized)
    normalized = re.sub(r"-+", "-", normalized)
    return normalized.strip("-")


def _machine_candidate(text: str) -> str | None:
    match = _MACHINE_CANDIDATE_RE.search(text)
    return normalize_machine_reference(match.group(0)) if match else None
