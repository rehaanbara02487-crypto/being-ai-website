"""Structured logging for the agent generation pipeline."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("beingai.generation")


def log_generation_step(tag: str, **payload: Any) -> dict[str, Any]:
    entry = {
        "tag": tag,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **payload,
    }
    try:
        serialized = json.dumps(payload, default=str)
    except TypeError:
        serialized = str(payload)
    logger.info("[%s] %s", tag, serialized)
    return entry
