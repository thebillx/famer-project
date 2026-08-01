"""FastAPI application factory."""

from __future__ import annotations

from apps.api.agriscope_api.core.config import load_settings
from apps.api.agriscope_api.core.errors import ApiError, ApiException
from apps.api.agriscope_api.core.middleware import REQUEST_ID_HEADER, SECURITY_HEADERS, get_or_create_request_id


def create_app():
    try:
        from fastapi import FastAPI, Request
        from fastapi.responses import JSONResponse
    except Exception as exc:  # pragma: no cover - dependency-light validation path
        raise RuntimeError("FastAPI is required to create the application") from exc

    from apps.api.agriscope_api.api.router import create_root_router

    settings = load_settings()
    app = FastAPI(title=settings.app_name, version="0.1.0")

    @app.middleware("http")
    async def request_context_middleware(request: Request, call_next):
        request_id = get_or_create_request_id(dict(request.headers))
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers[REQUEST_ID_HEADER] = request_id
        for name, value in SECURITY_HEADERS.items():
            response.headers.setdefault(name, value)
        return response

    @app.exception_handler(ApiException)
    async def api_exception_handler(request: Request, exc: ApiException):
        request_id = getattr(request.state, "request_id", get_or_create_request_id({}))
        error = ApiError(exc.code, exc.message, request_id, exc.details)
        return JSONResponse(status_code=exc.status_code, content=error.to_response())

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        request_id = getattr(request.state, "request_id", get_or_create_request_id({}))
        error = ApiError("internal_error", "Unexpected server error", request_id)
        return JSONResponse(status_code=500, content=error.to_response())

    app.include_router(create_root_router(settings))
    return app
