"""FastAPI application factory."""

from __future__ import annotations

from apps.api.agriscope_api.core.config import load_settings
from apps.api.agriscope_api.core.errors import ApiError, ApiException
from apps.api.agriscope_api.core.middleware import REQUEST_ID_HEADER, SECURITY_HEADERS, get_or_create_request_id
from apps.api.agriscope_api.core.rate_limit import FixedWindowRateLimiter

_PUBLIC_VALIDATION_LOCATIONS = frozenset({"body", "cookie", "header", "path", "query"})


def _public_validation_errors(errors) -> list[dict[str, object]]:
    public: list[dict[str, object]] = []
    for error in errors:
        raw_location = error.get("loc", ()) if isinstance(error, dict) else ()
        location: list[str | int] = []
        segments = raw_location[:8] if isinstance(raw_location, (list, tuple)) else ()
        for segment in segments:
            if type(segment) is int and 0 <= segment <= 1_000_000:
                location.append(segment)
            elif isinstance(segment, str) and segment in _PUBLIC_VALIDATION_LOCATIONS:
                location.append(segment)
            else:
                location.append("field")

        raw_type = error.get("type") if isinstance(error, dict) else None
        error_type = (
            raw_type
            if isinstance(raw_type, str)
            and 0 < len(raw_type) <= 80
            and all(
                character.isascii() and (character.isalnum() or character in "._")
                for character in raw_type
            )
            else "validation_error"
        )
        public.append(
            {
                "loc": location,
                "type": error_type,
                "message": "Field required" if error_type == "missing" else "Invalid value",
            }
        )
    return public


def create_app():
    try:
        from fastapi import FastAPI, Request
        from fastapi.exceptions import RequestValidationError
        from fastapi.responses import JSONResponse
    except Exception as exc:  # pragma: no cover - dependency-light validation path
        raise RuntimeError("FastAPI is required to create the application") from exc

    from apps.api.agriscope_api.api.router import create_root_router

    settings = load_settings()
    app = FastAPI(title=settings.app_name, version="0.1.0")
    app.state.settings = settings
    app.state.rate_limiter = FixedWindowRateLimiter(
        secret=settings.session_secret,
        window_seconds=settings.rate_limit_window_seconds,
        max_entries=settings.rate_limit_max_entries,
    )

    from fastapi.middleware.cors import CORSMiddleware

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.app_url],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["authorization", "content-type", "x-csrf-token", "x-request-id"],
    )

    from apps.api.agriscope_api.db.session import create_engine, create_session_factory

    app.state.db_engine = create_engine(settings)
    app.state.session_factory = create_session_factory(app.state.db_engine)

    @app.on_event("shutdown")
    async def shutdown_database() -> None:
        await app.state.db_engine.dispose()

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
        headers = None
        if exc.code == "rate_limited":
            headers = {"Retry-After": str(exc.details["retry_after"])}
        return JSONResponse(status_code=exc.status_code, content=error.to_response(), headers=headers)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        request_id = getattr(request.state, "request_id", get_or_create_request_id({}))
        error = ApiError(
            "validation_error",
            "Request validation failed",
            request_id,
            {"errors": _public_validation_errors(exc.errors())},
        )
        return JSONResponse(status_code=422, content=error.to_response())

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        request_id = getattr(request.state, "request_id", get_or_create_request_id({}))
        error = ApiError("internal_error", "Unexpected server error", request_id)
        return JSONResponse(status_code=500, content=error.to_response())

    app.include_router(create_root_router(settings))
    return app
