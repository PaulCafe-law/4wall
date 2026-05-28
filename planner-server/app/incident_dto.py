from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


IncidentStatusLiteral = Literal["pending_review", "confirmed", "in_progress", "resolved", "false_positive"]
IncidentSeverityLiteral = Literal["low", "medium", "high", "critical"]
IncidentSourceLiteral = Literal["ai_detection", "manual", "pocket_lens", "camera", "drone", "vehicle"]
IncidentEvidenceTypeLiteral = Literal["image", "video", "text", "link"]


class IncidentLocationDto(BaseModel):
    siteId: str | None = None
    siteName: str | None = None
    areaName: str | None = None
    floor: str | None = None
    equipmentId: str | None = None
    equipmentName: str | None = None
    description: str | None = None
    worldX: float | None = None
    worldY: float | None = None
    worldZ: float | None = None
    cameraId: str | None = None
    modelObjectId: str | None = None


class IncidentEvidenceDto(BaseModel):
    evidenceId: str
    type: IncidentEvidenceTypeLiteral
    url: str | None = None
    text: str | None = None
    createdAt: datetime


class IncidentEvidenceInputDto(BaseModel):
    type: IncidentEvidenceTypeLiteral
    url: str | None = None
    text: str | None = None


class IncidentCommentDto(BaseModel):
    commentId: str
    authorName: str
    content: str
    createdAt: datetime


class IncidentHistoryDto(BaseModel):
    historyId: str
    action: str
    fromValue: str | None = None
    toValue: str | None = None
    actorName: str
    createdAt: datetime


class IncidentLineNotificationDto(BaseModel):
    notificationId: str
    incidentId: str | None = None
    action: str
    targetId: str | None = None
    message: str
    status: str
    errorMessage: str | None = None
    createdAt: datetime
    sentAt: datetime | None = None


class IncidentDto(BaseModel):
    incidentId: str
    organizationId: str
    siteId: str | None = None
    title: str
    description: str
    status: IncidentStatusLiteral
    severity: IncidentSeverityLiteral
    source: IncidentSourceLiteral
    location: IncidentLocationDto
    evidence: list[IncidentEvidenceDto] = Field(default_factory=list)
    comments: list[IncidentCommentDto] = Field(default_factory=list)
    history: list[IncidentHistoryDto] = Field(default_factory=list)
    lineNotifications: list[IncidentLineNotificationDto] = Field(default_factory=list)
    assigneeName: str | None = None
    reporterName: str | None = None
    aiSummary: str | None = None
    aiConfidence: float | None = None
    createdAt: datetime
    updatedAt: datetime
    resolvedAt: datetime | None = None


class CreateIncidentRequestDto(BaseModel):
    organizationId: str
    siteId: str | None = None
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    severity: IncidentSeverityLiteral = "medium"
    source: IncidentSourceLiteral = "manual"
    location: IncidentLocationDto = Field(default_factory=IncidentLocationDto)
    evidence: list[IncidentEvidenceInputDto] = Field(default_factory=list)
    assigneeName: str | None = Field(default=None, max_length=120)
    reporterName: str | None = Field(default=None, max_length=120)
    aiSummary: str | None = None
    aiConfidence: float | None = Field(default=None, ge=0, le=1)


class UpdateIncidentStatusRequestDto(BaseModel):
    status: IncidentStatusLiteral


class UpdateIncidentSeverityRequestDto(BaseModel):
    severity: IncidentSeverityLiteral


class AssignIncidentRequestDto(BaseModel):
    assigneeName: str | None = Field(default=None, max_length=120)


class AddIncidentCommentRequestDto(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class AddIncidentEvidenceRequestDto(IncidentEvidenceInputDto):
    pass


class IncidentDailySummaryDto(BaseModel):
    date: date
    newIncidentCount: int
    statusCounts: dict[str, int]
    severityCounts: dict[str, int]
    criticalHighIncidents: list[IncidentDto]
    resolvedIncidents: list[IncidentDto]
    unhandledIncidents: list[IncidentDto]
    lineSummaryMessage: str


class LineWebhookResponseDto(BaseModel):
    processed: int
    skipped: int


class LinePushSummaryResponseDto(BaseModel):
    notification: IncidentLineNotificationDto


LineMessage = dict[str, Any]
