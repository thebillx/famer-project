"""ASGI entrypoint."""

from __future__ import annotations

from apps.api.agriscope_api.application import create_app

app = create_app()
