"""FastAPI entrypoint.

The import is intentionally local so unit tests for foundation packages can run
without FastAPI installed. Runtime containers install the locked backend dependencies.
"""

from __future__ import annotations


def create_app():
    from fastapi import FastAPI

    app = FastAPI(title="AgriScope Thailand API", version="0.1.0")

    @app.get("/health/live")
    def live() -> dict[str, str]:
        return {"status": "live"}

    @app.get("/health/ready")
    def ready() -> dict[str, str]:
        return {"status": "ready"}

    @app.get("/health/dependencies")
    def dependencies() -> dict[str, str]:
        return {"database": "not_checked", "redis": "not_checked", "object_storage": "not_checked"}

    return app


app = create_app()
