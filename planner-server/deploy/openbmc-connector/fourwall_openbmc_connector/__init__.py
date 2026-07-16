"""Outbound-only 4WALL adapter for the local OpenBMC/Pi5 collector."""

__version__ = "0.1.0"

from .runner import ConnectorRunner

__all__ = ["ConnectorRunner"]
