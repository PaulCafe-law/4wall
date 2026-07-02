from __future__ import annotations

from reader.config import MqttConfig
from reader.publish import MqttPublisher


def test_disabled_mqtt_does_not_queue_readings() -> None:
    publisher = MqttPublisher(
        MqttConfig(
            enabled=False,
            host="127.0.0.1",
            port=1883,
            base_topic="4wall/test",
            client_id="test",
        )
    )

    publisher.publish_reading("press_am_meter", {"value": 0})

    assert publisher.state.queued == 0
    assert len(publisher.queue) == 0
