from __future__ import annotations

from fourwall_openbmc_connector.state import MAX_SENT_EVENT_KEYS, StateStore


def test_state_is_bounded_and_persists_active_command(tmp_path):
    path = tmp_path / "state.json"
    store = StateStore(path)
    store.mark_events_sent([f"event-{index}" for index in range(MAX_SENT_EVENT_KEYS + 20)])
    store.set_active_command({"commandId": "cmd_1", "phase": "claimed"})

    loaded = StateStore(path)

    assert len(loaded.data["sentEventKeys"]) == MAX_SENT_EVENT_KEYS
    assert loaded.data["sentEventKeys"][0] == "event-20"
    assert loaded.active_command["commandId"] == "cmd_1"
    assert loaded.collector_instance_id == store.collector_instance_id
