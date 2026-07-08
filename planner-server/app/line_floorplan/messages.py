from __future__ import annotations

from urllib.parse import urlencode

from .layout import BASE_HEIGHT, BASE_WIDTH, FloorplanLayout
from .service import GaugeReadingView, MachineDetailView


def build_floorplan_imagemap_message(settings, *, layout: FloorplanLayout, group_id: str, render_token: str) -> dict:
    if not settings.line_public_base_url:
        raise ValueError("missing_line_public_base_url")
    base_origin = settings.line_public_base_url.rstrip("/")
    base_url = f"{base_origin}/v1/line/floorplan/{layout.site_slug}/{render_token}"
    return {
        "type": "imagemap",
        "baseUrl": base_url,
        "altText": "靚程工廠廠區圖",
        "baseSize": {"width": BASE_WIDTH, "height": BASE_HEIGHT},
        "actions": [
            {
                "type": "message",
                "label": machine.label[:20],
                "text": f"機台 {machine.id}",
                "area": machine.rect.to_line_area(),
            }
            for machine in layout.machines
        ],
    }


def build_liveview_button_message(*, liveview_url: str) -> dict:
    return {
        "type": "flex",
        "altText": "開啟即時廠區圖",
        "contents": {
            "type": "bubble",
            "size": "mega",
            "body": {
                "type": "box",
                "layout": "vertical",
                "spacing": "sm",
                "contents": [
                    {"type": "text", "text": "即時廠區圖", "weight": "bold", "size": "lg"},
                    {"type": "text", "text": "在 LINE 內建瀏覽器查看可縮放的即時狀態圖。", "size": "sm", "wrap": True},
                ],
            },
            "footer": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "button",
                        "style": "primary",
                        "color": "#171B1F",
                        "action": {"type": "uri", "label": "開啟即時圖", "uri": liveview_url},
                    }
                ],
            },
        },
    }


def build_machine_list_message(layout: FloorplanLayout) -> dict:
    bubbles = [
        {
            "type": "bubble",
            "size": "micro",
            "body": {
                "type": "box",
                "layout": "vertical",
                "spacing": "sm",
                "contents": [
                    {"type": "text", "text": machine.label, "weight": "bold", "size": "sm", "wrap": True},
                    {"type": "text", "text": machine.id, "size": "xxs", "color": "#6B7280", "wrap": True},
                ],
            },
            "footer": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "button",
                        "height": "sm",
                        "style": "primary",
                        "color": "#171B1F",
                        "action": {"type": "message", "label": "詳情", "text": f"機台 {machine.id}"},
                    }
                ],
            },
        }
        for machine in layout.machines
    ]
    return {
        "type": "flex",
        "altText": "靚程工廠機台清單",
        "contents": {"type": "carousel", "contents": bubbles},
    }


def build_gauges_message(gauges_by_machine: dict[str, tuple[GaugeReadingView, ...]], layout: FloorplanLayout) -> dict:
    contents: list[dict] = []
    for machine in layout.machines:
        gauges = gauges_by_machine.get(machine.id) or ()
        if not gauges:
            continue
        contents.append({"type": "text", "text": machine.label, "weight": "bold", "size": "sm"})
        contents.extend(_gauge_text_row(gauge) for gauge in gauges)
        contents.append({"type": "separator", "margin": "md"})
    if not contents:
        contents = [{"type": "text", "text": "目前沒有可用儀表資料", "size": "sm", "wrap": True}]
    return {
        "type": "flex",
        "altText": "靚程工廠儀表讀值",
        "contents": {
            "type": "bubble",
            "size": "mega",
            "header": {
                "type": "box",
                "layout": "vertical",
                "contents": [{"type": "text", "text": "儀表讀值", "weight": "bold", "size": "lg"}],
            },
            "body": {"type": "box", "layout": "vertical", "spacing": "sm", "contents": contents},
        },
    }


def build_machine_detail_message(detail: MachineDetailView, *, liveview_url: str | None = None) -> dict:
    body_contents: list[dict] = [
        {"type": "text", "text": f"{detail.machine.label}・{detail.site.name}", "weight": "bold", "size": "lg", "wrap": True},
        {"type": "text", "text": f"今日異常 {detail.today_incident_count} 件", "size": "sm", "color": "#374151"},
        {"type": "separator", "margin": "md"},
    ]
    if detail.gauges:
        body_contents.extend(_gauge_text_row(gauge) for gauge in detail.gauges)
    else:
        body_contents.append({"type": "text", "text": "暫無指定儀表", "size": "sm", "color": "#6B7280"})
    if not detail.thumbnail_url:
        body_contents.extend(
            [
                {"type": "separator", "margin": "md"},
                {"type": "text", "text": "暫無可公開縮圖", "size": "sm", "color": "#6B7280", "wrap": True},
            ]
        )
    footer_contents: list[dict] = []
    if liveview_url:
        footer_contents.append(
            {
                "type": "button",
                "style": "secondary",
                "action": {"type": "uri", "label": "即時圖", "uri": liveview_url},
            }
        )
    footer_contents.append(
        {
            "type": "button",
            "style": "primary",
            "color": "#C93B2F",
            "action": {
                "type": "postback",
                "label": "回報異常",
                "data": urlencode({"action": "report_machine_incident", "machineId": detail.machine.id}),
            },
        }
    )
    bubble: dict = {
        "type": "bubble",
        "size": "mega",
        "body": {"type": "box", "layout": "vertical", "spacing": "sm", "contents": body_contents},
        "footer": {
            "type": "box",
            "layout": "vertical",
            "spacing": "sm",
            "contents": footer_contents,
        },
    }
    if detail.thumbnail_url:
        bubble["hero"] = {
            "type": "image",
            "url": detail.thumbnail_url,
            "size": "full",
            "aspectRatio": "16:9",
            "aspectMode": "cover",
        }
    return {"type": "flex", "altText": f"{detail.machine.label} 詳情", "contents": bubble}


def build_help_message() -> dict:
    return {
        "type": "flex",
        "altText": "LINE 廠區圖使用說明",
        "contents": {
            "type": "bubble",
            "size": "mega",
            "body": {
                "type": "box",
                "layout": "vertical",
                "spacing": "sm",
                "contents": [
                    {"type": "text", "text": "可用指令", "weight": "bold", "size": "lg"},
                    {"type": "text", "text": "廠區圖 / 機台 / 儀表 / 異常", "size": "sm", "wrap": True},
                    {"type": "text", "text": "機台 m-hc600", "size": "sm", "wrap": True, "color": "#374151"},
                ],
            },
        },
    }


def build_image_message(original_url: str, preview_url: str | None = None) -> dict:
    return {
        "type": "image",
        "originalContentUrl": original_url,
        "previewImageUrl": preview_url or original_url,
    }


def build_text_message(text: str) -> dict:
    return {"type": "text", "text": text[:5000]}


def _gauge_text_row(gauge: GaugeReadingView) -> dict:
    value_text = "--" if gauge.value is None else f"{gauge.value:g} {gauge.unit}".strip()
    time_text = "無資料" if gauge.minutes_ago is None else f"{gauge.minutes_ago} 分鐘前"
    stale_text = "過期" if gauge.stale else gauge.status
    return {
        "type": "box",
        "layout": "vertical",
        "spacing": "xs",
        "contents": [
            {
                "type": "text",
                "text": f"{gauge.label}: {value_text} {gauge.trend}".strip(),
                "size": "sm",
                "wrap": True,
            },
            {
                "type": "text",
                "text": f"信心 {gauge.confidence:.0%}・{time_text}・{stale_text}",
                "size": "xxs",
                "color": "#6B7280",
                "wrap": True,
            },
        ],
    }
