from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from statistics import median


@dataclass
class GaugeSmoother:
    min_val: float
    max_val: float
    window_size: int = 5
    outlier_fraction: float = 0.15
    values: deque[float] = field(default_factory=deque)
    last_good: float | None = None

    def update(self, value: float | None, confidence: float) -> tuple[float | None, bool]:
        if value is None:
            return self.last_good, False

        span = max(1e-9, self.max_val - self.min_val)
        if self.last_good is not None and confidence < 0.75:
            if abs(value - self.last_good) > span * self.outlier_fraction:
                return self.last_good, False

        self.values.append(float(value))
        while len(self.values) > self.window_size:
            self.values.popleft()

        smoothed = float(median(self.values))
        self.last_good = smoothed
        return smoothed, True
