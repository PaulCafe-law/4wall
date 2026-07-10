from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone

from fastapi.testclient import TestClient
import pytest

from app import twin_agent
from app.line_bot import LineBotDeliveryError
from app.main import build_app
from app.models import DecisionPointRecord
from app.twin_agent import (
    COMMAND_FRESH_WINDOW,
    JOB_CLAIMED_TTL,
    JOB_PENDING_TTL,
    REPLY_TOKEN_MAX_AGE,
    TWIN_AGENT_OFFLINE_TEXT,
    WORKER_ONLINE_WINDOW,
    append_feed_event,
    clear_twin_agent_state,
    collect_feed_events,
    enqueue_twin_agent_job,
)
from tests.helpers import login_web, seed_organization, seed_user


PASSWORD = "Password123!"
WORKER_TOKEN = "twin-worker-secret"
SESSION_ID = "twin-session-test"


@pytest.fixture(autouse=True)
def _twin_agent_state():
    clear_twin_agent_state()
    yield
    clear_twin_agent_state()


def _twin_settings(test_settings, **overrides):
    values = {"twin_agent_enabled": True, "twin_agent_worker_token": WORKER_TOKEN}
    values.update(overrides)
    return replace(test_settings, **values)


def _internal_headers(app, client: TestClient) -> dict[str, str]:
    with app.state.session_factory() as session:
        seed_user(session, email="ops@twin.test", password=PASSWORD, global_roles=["ops"])
        session.commit()
    headers, _ = login_web(client, email="ops@twin.test", password=PASSWORD)
    return headers


def _worker_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {WORKER_TOKEN}"}


def _snapshot_body(world: dict | None = None) -> dict:
    return {
        "sessionId": SESSION_ID,
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "world": world if world is not None else {"entities": []},
    }


def _capture_line_push(monkeypatch) -> list[dict]:
    pushes: list[dict] = []

    def fake_push_line_message(_settings, target_id, message):
        pushes.append({"target": target_id, "message": message})
        return {"status": "ok"}

    monkeypatch.setattr("app.twin_agent.push_line_message", fake_push_line_message)
    return pushes


def test_endpoints_return_503_when_disabled(test_settings) -> None:
    app = build_app(settings=test_settings)
    with TestClient(app) as client:
        responses = [
            client.post("/v1/twin-agent/snapshot", json=_snapshot_body()),
            client.post("/v1/twin-agent/messages", json={"sessionId": SESSION_ID, "text": "hi"}),
            client.get(f"/v1/twin-agent/updates?sessionId={SESSION_ID}&cursor=0"),
            client.get("/v1/twin-agent/status"),
            client.get("/v1/twin-agent/jobs", headers=_worker_headers()),
            client.post("/v1/twin-agent/jobs/unknown/result", json={"text": "hi"}, headers=_worker_headers()),
        ]

    for response in responses:
        assert response.status_code == 503, response.text
        assert response.json()["detail"] == "twin_agent_disabled"


def test_worker_endpoints_require_worker_token(test_settings) -> None:
    app = build_app(settings=_twin_settings(test_settings))
    with TestClient(app) as client:
        assert client.get("/v1/twin-agent/jobs").status_code == 401
        wrong = client.get("/v1/twin-agent/jobs", headers={"Authorization": "Bearer wrong-token"})
        assert wrong.status_code == 401
        assert wrong.json()["detail"] == "twin_agent_worker_unauthorized"

    unset_app = build_app(settings=_twin_settings(test_settings, twin_agent_worker_token=None))
    with TestClient(unset_app) as client:
        response = client.get("/v1/twin-agent/jobs", headers=_worker_headers())
        assert response.status_code == 503
        assert response.json()["detail"] == "twin_agent_worker_token_missing"


def test_customer_web_endpoints_are_scoped_to_snapshot_owner(test_settings) -> None:
    app = build_app(settings=_twin_settings(test_settings))
    with TestClient(app) as client:
        with app.state.session_factory() as session:
            org = seed_organization(session, name="Twin Org")
            org_id = org.id
            seed_user(session, email="customer-a@twin.test", password=PASSWORD, org_roles=[(org.id, "customer_admin")])
            seed_user(session, email="customer-b@twin.test", password=PASSWORD, org_roles=[(org.id, "customer_viewer")])
            session.commit()
        headers_a, _ = login_web(client, email="customer-a@twin.test", password=PASSWORD)
        headers_b, _ = login_web(client, email="customer-b@twin.test", password=PASSWORD)
        snapshot = {**_snapshot_body({"entities": [{"id": "own-machine"}]}), "organizationId": org_id}

        assert client.post("/v1/twin-agent/snapshot", json=_snapshot_body()).status_code == 401
        assert client.post("/v1/twin-agent/snapshot", json=snapshot, headers=headers_a).status_code == 204
        assert client.post("/v1/twin-agent/messages", json={"sessionId": SESSION_ID, "text": "hi"}, headers=headers_a).status_code == 200
        assert client.get(f"/v1/twin-agent/updates?sessionId={SESSION_ID}", headers=headers_a).status_code == 200
        assert client.post("/v1/twin-agent/messages", json={"sessionId": SESSION_ID, "text": "hi"}, headers=headers_b).status_code == 404
        assert client.get(f"/v1/twin-agent/updates?sessionId={SESSION_ID}", headers=headers_b).status_code == 404


def test_status_reports_worker_and_only_readable_snapshot_health(test_settings) -> None:
    app = build_app(settings=_twin_settings(test_settings))
    with TestClient(app) as client:
        with app.state.session_factory() as session:
            org_a = seed_organization(session, name="Status Org A")
            org_b = seed_organization(session, name="Status Org B")
            seed_user(session, email="status-a@twin.test", password=PASSWORD, org_roles=[(org_a.id, "customer_admin")])
            seed_user(session, email="status-b@twin.test", password=PASSWORD, org_roles=[(org_b.id, "customer_viewer")])
            session.commit()
            org_a_id = org_a.id
        headers_a, _ = login_web(client, email="status-a@twin.test", password=PASSWORD)
        headers_b, _ = login_web(client, email="status-b@twin.test", password=PASSWORD)

        assert client.get("/v1/twin-agent/status").status_code == 401
        initial = client.get("/v1/twin-agent/status", headers=headers_a).json()
        assert initial["workerOnline"] is False
        assert initial["snapshotAvailable"] is False

        snapshot = {**_snapshot_body({"entities": [{"id": "org-a-machine"}]}), "organizationId": org_a_id}
        assert client.post("/v1/twin-agent/snapshot", json=snapshot, headers=headers_a).status_code == 204
        client.get("/v1/twin-agent/jobs", headers=_worker_headers())

        own_status = client.get("/v1/twin-agent/status", headers=headers_a).json()
        other_status = client.get("/v1/twin-agent/status", headers=headers_b).json()

    assert own_status["enabled"] is True
    assert own_status["workerOnline"] is True
    assert own_status["workerLastSeenSeconds"] >= 0
    assert own_status["snapshotAvailable"] is True
    assert own_status["snapshotAgeSeconds"] >= 0
    assert own_status["snapshotCapturedAt"]
    assert other_status["workerOnline"] is True
    assert other_status["snapshotAvailable"] is False
    assert other_status["snapshotCapturedAt"] is None


def test_snapshot_size_guard(test_settings) -> None:
    app = build_app(settings=_twin_settings(test_settings))
    with TestClient(app) as client:
        headers = _internal_headers(app, client)
        ok = client.post("/v1/twin-agent/snapshot", json=_snapshot_body(), headers=headers)
        too_large = client.post(
            "/v1/twin-agent/snapshot",
            json=_snapshot_body({"blob": "x" * 120_001}),
            headers=headers,
        )

    assert ok.status_code == 204, ok.text
    assert too_large.status_code == 413
    assert too_large.json()["detail"] == "twin_agent_snapshot_too_large"


def test_web_message_rate_limit(test_settings) -> None:
    app = build_app(settings=_twin_settings(test_settings))
    with TestClient(app) as client:
        headers = _internal_headers(app, client)
        assert client.post("/v1/twin-agent/snapshot", json=_snapshot_body(), headers=headers).status_code == 204
        statuses = [
            client.post(
                "/v1/twin-agent/messages",
                json={"sessionId": SESSION_ID, "text": f"question {index}"},
                headers=headers,
            ).status_code
            for index in range(11)
        ]

    assert statuses[:10] == [200] * 10
    assert statuses[10] == 429


def test_web_job_round_trip(test_settings) -> None:
    app = build_app(settings=_twin_settings(test_settings))
    with TestClient(app) as client:
        headers = _internal_headers(app, client)
        world = {"entities": [{"id": "m-1", "status": "running"}]}
        assert client.post("/v1/twin-agent/snapshot", json=_snapshot_body(world), headers=headers).status_code == 204

        initial = client.get(f"/v1/twin-agent/updates?sessionId={SESSION_ID}", headers=headers).json()
        assert initial == {"workerOnline": False, "events": [], "cursor": 0}

        message = client.post(
            "/v1/twin-agent/messages", json={"sessionId": SESSION_ID, "text": "status?"}, headers=headers
        )
        assert message.status_code == 200, message.text
        job_id = message.json()["jobId"]

        claimed = client.get("/v1/twin-agent/jobs", headers=_worker_headers()).json()
        assert claimed["job"]["jobId"] == job_id
        assert claimed["job"]["source"] == "web"
        assert claimed["job"]["text"] == "status?"
        assert claimed["job"]["sessionId"] == SESSION_ID
        assert claimed["world"] == world
        assert claimed["worldAgeSeconds"] >= 0
        assert client.get("/v1/twin-agent/jobs", headers=_worker_headers()).json()["job"] is None

        result = client.post(
            f"/v1/twin-agent/jobs/{job_id}/result",
            json={"text": "回答", "toolCalls": [{"name": "focus_camera", "arguments": {"id": "cam-1"}}]},
            headers=_worker_headers(),
        )
        assert result.status_code == 204, result.text

        fresh = client.get(f"/v1/twin-agent/updates?sessionId={SESSION_ID}", headers=headers).json()
        assert fresh["workerOnline"] is True
        assert fresh["events"] == []
        assert fresh["cursor"] == 2

        backlog = client.get(f"/v1/twin-agent/updates?sessionId={SESSION_ID}&cursor=0", headers=headers).json()
        assert backlog["cursor"] == 2
        assert backlog["events"] == [
            {"seq": 1, "kind": "reply", "jobId": job_id, "source": "web", "text": "回答"},
            {
                "seq": 2,
                "kind": "commands",
                "jobId": job_id,
                "source": "web",
                "toolCalls": [{"name": "focus_camera", "arguments": {"id": "cam-1"}}],
            },
        ]

        second = client.post(
            "/v1/twin-agent/messages", json={"sessionId": SESSION_ID, "text": "again"}, headers=headers
        )
        second_job_id = second.json()["jobId"]
        client.get("/v1/twin-agent/jobs", headers=_worker_headers())
        client.post(
            f"/v1/twin-agent/jobs/{second_job_id}/result",
            json={"text": "第二次", "toolCalls": [{"name": "highlight_entity", "arguments": {"ids": ["m-1"]}}]},
            headers=_worker_headers(),
        )

        updates = client.get(f"/v1/twin-agent/updates?sessionId={SESSION_ID}&cursor=2", headers=headers).json()
        assert updates["cursor"] == 4
        assert updates["events"] == [
            {"seq": 3, "kind": "reply", "jobId": second_job_id, "source": "web", "text": "第二次"},
            {
                "seq": 4,
                "kind": "commands",
                "jobId": second_job_id,
                "source": "web",
                "toolCalls": [{"name": "highlight_entity", "arguments": {"ids": ["m-1"]}}],
            },
        ]
        drained = client.get(f"/v1/twin-agent/updates?sessionId={SESSION_ID}&cursor=4", headers=headers).json()
        assert drained["events"] == []
        assert drained["cursor"] == 4


def test_worker_job_includes_ledger_context_for_line_org(test_settings) -> None:
    app = build_app(settings=_twin_settings(test_settings))
    now = datetime.now(timezone.utc)
    with TestClient(app) as client:
        with app.state.session_factory() as session:
            org = seed_organization(session, name="Ledger Twin Org")
            session.add(
                DecisionPointRecord(
                    organization_id=org.id,
                    event_type="plan_vs_actual",
                    source="work_order",
                    subject_ref="HC600-01",
                    occurred_at=now,
                    plan_json={"plannedTotal": 500, "moldNo": "GM096LC"},
                    actual_json={"actualTotal": 480},
                    actual_recorded_at=now,
                    consistent=False,
                    status="resolved",
                )
            )
            session.commit()
            org_id = org.id

        enqueue_twin_agent_job(
            source="line",
            text="今日計畫 vs 實際對帳簡報",
            organization_id=org_id,
            group_id="Cgroup",
            site_slug="jingcheng",
        )
        claimed = client.get("/v1/twin-agent/jobs", headers=_worker_headers()).json()

    assert claimed["job"]["organizationId"] == org_id
    assert claimed["ledgerContext"]["available"] is True
    assert claimed["ledgerContext"]["organizationId"] == org_id
    assert "HC600-01" in claimed["ledgerContext"]["text"]
    item = claimed["ledgerContext"]["planVsActual"][0]
    assert item["machineNo"] == "HC600-01"
    assert item["plannedTotal"] == 500
    assert item["actualTotal"] == 480
    assert item["consistent"] is False
    assert item["status"] == "mismatch"
    assert item["moldNo"] == "GM096LC"
    assert item["actualRecordedAt"]
    assert item["source"] == "work_order"


def test_worker_ledger_context_respects_job_organization_scope(test_settings) -> None:
    app = build_app(settings=_twin_settings(test_settings))
    now = datetime.now(timezone.utc)
    with TestClient(app) as client:
        with app.state.session_factory() as session:
            scoped_org = seed_organization(session, name="Scoped Org")
            other_org = seed_organization(session, name="Other Org")
            session.add(
                DecisionPointRecord(
                    organization_id=other_org.id,
                    event_type="plan_vs_actual",
                    source="work_order",
                    subject_ref="OTHER-01",
                    occurred_at=now,
                    plan_json={"plannedTotal": 999},
                )
            )
            session.commit()
            scoped_org_id = scoped_org.id

        enqueue_twin_agent_job(
            source="line",
            text="今日對帳",
            organization_id=scoped_org_id,
            group_id="Cgroup",
            site_slug="jingcheng",
        )
        claimed = client.get("/v1/twin-agent/jobs", headers=_worker_headers()).json()

    assert claimed["ledgerContext"]["organizationId"] == scoped_org_id
    assert claimed["ledgerContext"]["planVsActual"] == []
    assert "今日尚無派工單對帳資料" in claimed["ledgerContext"]["text"]
    assert "OTHER-01" not in claimed["ledgerContext"]["text"]


def test_updates_cursor_zero_after_init_delivers_new_events(test_settings) -> None:
    app = build_app(settings=_twin_settings(test_settings))
    with TestClient(app) as client:
        headers = _internal_headers(app, client)
        assert client.post("/v1/twin-agent/snapshot", json=_snapshot_body(), headers=headers).status_code == 204
        handshake = client.get(f"/v1/twin-agent/updates?sessionId={SESSION_ID}", headers=headers).json()
        assert handshake == {"workerOnline": False, "events": [], "cursor": 0}

        message = client.post(
            "/v1/twin-agent/messages", json={"sessionId": SESSION_ID, "text": "hello?"}, headers=headers
        )
        job_id = message.json()["jobId"]
        client.get("/v1/twin-agent/jobs", headers=_worker_headers())
        assert (
            client.post(
                f"/v1/twin-agent/jobs/{job_id}/result", json={"text": "回覆"}, headers=_worker_headers()
            ).status_code
            == 204
        )

        updates = client.get(
            f"/v1/twin-agent/updates?sessionId={SESSION_ID}&cursor={handshake['cursor']}", headers=headers
        ).json()
        assert updates["cursor"] == 1
        assert updates["events"] == [{"seq": 1, "kind": "reply", "jobId": job_id, "source": "web", "text": "回覆"}]


def test_collect_feed_events_skips_stale_commands() -> None:
    append_feed_event(SESSION_ID, kind="reply", job_id="job-1", source="web", text="第一")
    events, cursor = collect_feed_events(SESSION_ID, None)
    assert events == []
    assert cursor == 1

    events, cursor = collect_feed_events(SESSION_ID, 0)
    assert [event.seq for event in events] == [1]
    assert cursor == 1

    append_feed_event(
        SESSION_ID, kind="commands", job_id="job-1", source="web", tool_calls=[{"name": "clear_overlays", "arguments": {}}]
    )
    append_feed_event(SESSION_ID, kind="reply", job_id="job-2", source="web", text="第二")
    twin_agent._STATE.feeds[SESSION_ID][1].created_monotonic -= COMMAND_FRESH_WINDOW + 1

    events, cursor = collect_feed_events(SESSION_ID, 1)
    assert [event.seq for event in events] == [3]
    assert cursor == 3


def test_collect_feed_events_resyncs_cursor_beyond_tail() -> None:
    append_feed_event(SESSION_ID, kind="reply", job_id="job-1", source="web", text="第一")
    events, cursor = collect_feed_events(SESSION_ID, 999)
    assert events == []
    assert cursor == 1


def test_worker_stays_online_during_long_reply_and_result_refreshes_heartbeat(test_settings) -> None:
    app = build_app(settings=_twin_settings(test_settings))
    with TestClient(app) as client:
        headers = _internal_headers(app, client)
        assert client.post("/v1/twin-agent/snapshot", json=_snapshot_body(), headers=headers).status_code == 204
        job = enqueue_twin_agent_job(source="web", text="慢問題", session_id=SESSION_ID)
        client.get("/v1/twin-agent/jobs", headers=_worker_headers())

        twin_agent._STATE.last_worker_seen_monotonic -= 16
        mid_reply = client.get(f"/v1/twin-agent/updates?sessionId={SESSION_ID}", headers=headers).json()
        assert mid_reply["workerOnline"] is True

        twin_agent._STATE.last_worker_seen_monotonic -= WORKER_ONLINE_WINDOW
        stale = client.get(f"/v1/twin-agent/updates?sessionId={SESSION_ID}", headers=headers).json()
        assert stale["workerOnline"] is False

        result = client.post(f"/v1/twin-agent/jobs/{job.job_id}/result", json={"text": "回答"}, headers=_worker_headers())
        assert result.status_code == 204, result.text
        refreshed = client.get(f"/v1/twin-agent/updates?sessionId={SESSION_ID}", headers=headers).json()
        assert refreshed["workerOnline"] is True


def test_line_job_result_uses_reply_token_and_routes_commands_to_active_session(test_settings, monkeypatch) -> None:
    replies: list[dict] = []

    def fake_reply_line_messages(_settings, reply_token, messages):
        replies.append({"replyToken": reply_token, "messages": messages})
        return {"status": "ok"}

    monkeypatch.setattr("app.twin_agent.reply_line_messages", fake_reply_line_messages)
    pushes = _capture_line_push(monkeypatch)

    app = build_app(settings=_twin_settings(test_settings))
    with TestClient(app) as client:
        headers = _internal_headers(app, client)
        assert client.post("/v1/twin-agent/snapshot", json=_snapshot_body(), headers=headers).status_code == 204
        append_feed_event(SESSION_ID, kind="reply", job_id="seed", source="web", text="seed")
        assert client.get(f"/v1/twin-agent/updates?sessionId={SESSION_ID}&cursor=0", headers=headers).json()["cursor"] == 1

        job = enqueue_twin_agent_job(
            source="line", text="機況？", group_id="Cgroup", reply_token="reply-1", site_slug="jingcheng"
        )
        claimed = client.get("/v1/twin-agent/jobs", headers=_worker_headers()).json()
        assert claimed["job"]["jobId"] == job.job_id
        assert claimed["job"]["groupId"] == "Cgroup"
        assert claimed["job"]["siteSlug"] == "jingcheng"

        result = client.post(
            f"/v1/twin-agent/jobs/{job.job_id}/result",
            json={"text": "一切正常", "toolCalls": [{"name": "focus_camera", "arguments": {"id": "cam-1"}}]},
            headers=_worker_headers(),
        )
        assert result.status_code == 204, result.text

        updates = client.get(f"/v1/twin-agent/updates?sessionId={SESSION_ID}&cursor=1", headers=headers).json()
        assert updates["events"] == [
            {
                "seq": 2,
                "kind": "commands",
                "jobId": job.job_id,
                "source": "line",
                "toolCalls": [{"name": "focus_camera", "arguments": {"id": "cam-1"}}],
            }
        ]

    assert replies == [{"replyToken": "reply-1", "messages": [{"type": "text", "text": "一切正常"}]}]
    assert pushes == []


def test_line_job_reply_failure_falls_back_to_push(test_settings, monkeypatch) -> None:
    def failing_reply(_settings, _reply_token, _messages):
        raise LineBotDeliveryError("line_reply_failed")

    monkeypatch.setattr("app.twin_agent.reply_line_messages", failing_reply)
    pushes = _capture_line_push(monkeypatch)
    app = build_app(settings=_twin_settings(test_settings))
    with TestClient(app) as client:
        job = enqueue_twin_agent_job(source="line", text="機況？", group_id="Cgroup", reply_token="reply-1")
        client.get("/v1/twin-agent/jobs", headers=_worker_headers())
        result = client.post(
            f"/v1/twin-agent/jobs/{job.job_id}/result", json={"text": "一切正常"}, headers=_worker_headers()
        )

    assert result.status_code == 204, result.text
    assert pushes == [{"target": "Cgroup", "message": {"type": "text", "text": "一切正常"}}]


def test_line_job_result_without_active_session_skips_commands(test_settings, monkeypatch) -> None:
    pushes = _capture_line_push(monkeypatch)
    app = build_app(settings=_twin_settings(test_settings))
    with TestClient(app) as client:
        job = enqueue_twin_agent_job(source="line", text="hi", group_id="Cgroup")
        client.get("/v1/twin-agent/jobs", headers=_worker_headers())
        result = client.post(
            f"/v1/twin-agent/jobs/{job.job_id}/result",
            json={"text": "ok", "toolCalls": [{"name": "clear_overlays", "arguments": {}}]},
            headers=_worker_headers(),
        )

    assert result.status_code == 204, result.text
    assert pushes == [{"target": "Cgroup", "message": {"type": "text", "text": "ok"}}]
    assert twin_agent._STATE.feeds == {}


def test_job_result_unknown_and_not_claimed(test_settings) -> None:
    app = build_app(settings=_twin_settings(test_settings))
    with TestClient(app) as client:
        missing = client.post(
            "/v1/twin-agent/jobs/does-not-exist/result", json={"text": "hi"}, headers=_worker_headers()
        )
        assert missing.status_code == 404
        assert missing.json()["detail"] == "twin_agent_job_not_found"

        job = enqueue_twin_agent_job(source="web", text="hello", session_id=SESSION_ID)
        pending = client.post(f"/v1/twin-agent/jobs/{job.job_id}/result", json={"text": "hi"}, headers=_worker_headers())
        assert pending.status_code == 409
        assert pending.json()["detail"] == "twin_agent_job_not_claimed"

        client.get("/v1/twin-agent/jobs", headers=_worker_headers())
        first = client.post(f"/v1/twin-agent/jobs/{job.job_id}/result", json={"text": "hi"}, headers=_worker_headers())
        second = client.post(f"/v1/twin-agent/jobs/{job.job_id}/result", json={"text": "hi"}, headers=_worker_headers())
        assert first.status_code == 204
        assert second.status_code == 409


def test_sweep_expires_pending_line_job_and_pushes_canned_reply(test_settings, monkeypatch) -> None:
    pushes = _capture_line_push(monkeypatch)
    app = build_app(settings=_twin_settings(test_settings))
    with TestClient(app) as client:
        enqueue_twin_agent_job(source="line", text="慢問題", group_id="Cgroup", reply_token="reply-slow")
        twin_agent._STATE.jobs[0].created_monotonic -= JOB_PENDING_TTL + REPLY_TOKEN_MAX_AGE + 1
        claimed = client.get("/v1/twin-agent/jobs", headers=_worker_headers()).json()

    assert claimed["job"] is None
    assert twin_agent._STATE.jobs[0].status == "expired"
    assert pushes == [{"target": "Cgroup", "message": {"type": "text", "text": TWIN_AGENT_OFFLINE_TEXT}}]


def test_sweep_expires_pending_web_job_and_appends_canned_reply(test_settings) -> None:
    app = build_app(settings=_twin_settings(test_settings))
    with TestClient(app) as client:
        headers = _internal_headers(app, client)
        assert client.post("/v1/twin-agent/snapshot", json=_snapshot_body(), headers=headers).status_code == 204
        handshake = client.get(f"/v1/twin-agent/updates?sessionId={SESSION_ID}", headers=headers).json()
        assert handshake["cursor"] == 0

        job = enqueue_twin_agent_job(source="web", text="慢問題", session_id=SESSION_ID)
        twin_agent._STATE.jobs[0].created_monotonic -= JOB_PENDING_TTL + 1

        updates = client.get(f"/v1/twin-agent/updates?sessionId={SESSION_ID}&cursor=0", headers=headers).json()

    assert twin_agent._STATE.jobs[0].status == "expired"
    assert updates["cursor"] == 1
    assert updates["events"] == [
        {"seq": 1, "kind": "reply", "jobId": job.job_id, "source": "web", "text": TWIN_AGENT_OFFLINE_TEXT}
    ]


def test_sweep_expires_stale_claimed_jobs(test_settings) -> None:
    app = build_app(settings=_twin_settings(test_settings))
    with TestClient(app) as client:
        headers = _internal_headers(app, client)
        assert client.post("/v1/twin-agent/snapshot", json=_snapshot_body(), headers=headers).status_code == 204
        job = enqueue_twin_agent_job(source="web", text="hello", session_id=SESSION_ID)
        client.get("/v1/twin-agent/jobs", headers=_worker_headers())
        twin_agent._STATE.jobs[0].claimed_monotonic -= JOB_CLAIMED_TTL + 1
        client.get(f"/v1/twin-agent/updates?sessionId={SESSION_ID}&cursor=0", headers=headers)
        assert twin_agent._STATE.jobs[0].status == "expired"

        late = client.post(f"/v1/twin-agent/jobs/{job.job_id}/result", json={"text": "late"}, headers=_worker_headers())
        assert late.status_code == 409
