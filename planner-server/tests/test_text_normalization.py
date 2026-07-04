from app.text_normalization import normalize_traditional_chinese, to_traditional_chinese


def test_to_traditional_chinese_handles_common_hmi_ocr_terms() -> None:
    assert to_traditional_chinese("生产日期 预计总数 后处理") == "生產日期 預計總數 後處理"
    assert to_traditional_chinese("生産日期") == "生產日期"


def test_normalize_traditional_chinese_recurses_through_payload() -> None:
    payload = {
        "workOrderRawText": "HC600 生产日期",
        "rawOcrLines": [{"text": "预计总数", "confidence": 0.9}],
        "structuredFields": {"operationMode": {"value": "手动生产"}},
    }

    assert normalize_traditional_chinese(payload) == {
        "workOrderRawText": "HC600 生產日期",
        "rawOcrLines": [{"text": "預計總數", "confidence": 0.9}],
        "structuredFields": {"operationMode": {"value": "手動生產"}},
    }
