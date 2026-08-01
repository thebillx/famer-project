"""Authentication API contracts."""

from __future__ import annotations

try:
    from fastapi import APIRouter, Depends, Request, Response, status
    from pydantic import BaseModel, Field
except Exception:  # pragma: no cover
    APIRouter = None  # type: ignore[assignment]
    Depends = None  # type: ignore[assignment]
    Request = object  # type: ignore[assignment]
    Response = object  # type: ignore[assignment]
    status = None  # type: ignore[assignment]

    class BaseModel:  # type: ignore[no-redef]
        pass

    def Field(*args, **kwargs):  # type: ignore[no-untyped-def]
        return None

from apps.api.agriscope_api.core.errors import ApiException
from apps.api.agriscope_api.dependencies.auth import ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=12)
    display_name: str = Field(min_length=1, max_length=160)
    organization_name: str = Field(min_length=1, max_length=200)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str


class UserResponse(BaseModel):
    id: str
    email: str
    display_name: str


class OrganizationResponse(BaseModel):
    id: str
    name: str
    slug: str
    status: str


class RegisterResponse(BaseModel):
    user: UserResponse
    organization: OrganizationResponse


router = APIRouter(prefix="/auth", tags=["auth"]) if APIRouter else None


if router:
    from apps.api.agriscope_api.dependencies.auth import get_current_user
    from apps.api.agriscope_api.dependencies.runtime import get_db_session, get_settings
    from apps.api.agriscope_api.services.auth import AuthService

    def _set_auth_cookies(response: Response, request: Request, access_token: str, refresh_token: str) -> None:
        settings = request.app.state.settings
        response.set_cookie(
            ACCESS_COOKIE_NAME,
            access_token,
            httponly=True,
            secure=settings.cookie_secure,
            samesite=settings.cookie_samesite,
            max_age=settings.access_token_ttl_minutes * 60,
            path="/",
        )
        response.set_cookie(
            REFRESH_COOKIE_NAME,
            refresh_token,
            httponly=True,
            secure=settings.cookie_secure,
            samesite=settings.cookie_samesite,
            max_age=settings.refresh_token_ttl_days * 24 * 60 * 60,
            path=f"{settings.api_v1_prefix}/auth",
        )

    def _delete_auth_cookies(response: Response, request: Request) -> None:
        settings = request.app.state.settings
        response.delete_cookie(ACCESS_COOKIE_NAME, path="/")
        response.delete_cookie(REFRESH_COOKIE_NAME, path=f"{settings.api_v1_prefix}/auth")

    @router.post("/register", status_code=status.HTTP_201_CREATED, response_model=RegisterResponse)
    async def register(
        payload: RegisterRequest,
        request: Request,
        response: Response,
        session=Depends(get_db_session),
        settings=Depends(get_settings),
    ) -> RegisterResponse:
        service = AuthService(settings)
        user, organization, access_token, refresh_token = await service.register(
            session,
            email=payload.email,
            password=payload.password,
            display_name=payload.display_name,
            organization_name=payload.organization_name,
        )
        _set_auth_cookies(response, request, access_token, refresh_token)
        return RegisterResponse(
            user=UserResponse(id=str(user.id), email=user.email, display_name=user.display_name),
            organization=OrganizationResponse(
                id=str(organization.id),
                name=organization.name,
                slug=organization.slug,
                status=organization.status,
            ),
        )

    @router.post("/login", status_code=status.HTTP_204_NO_CONTENT)
    async def login(
        payload: LoginRequest,
        request: Request,
        response: Response,
        session=Depends(get_db_session),
        settings=Depends(get_settings),
    ) -> Response:
        service = AuthService(settings)
        _, access_token, refresh_token = await service.login(
            session, email=payload.email, password=payload.password
        )
        _set_auth_cookies(response, request, access_token, refresh_token)
        response.status_code = status.HTTP_204_NO_CONTENT
        return response

    @router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
    async def logout(
        request: Request,
        response: Response,
        session=Depends(get_db_session),
        settings=Depends(get_settings),
    ) -> Response:
        service = AuthService(settings)
        await service.logout(session, request.cookies.get(REFRESH_COOKIE_NAME))
        _delete_auth_cookies(response, request)
        response.status_code = status.HTTP_204_NO_CONTENT
        return response

    @router.post("/refresh", status_code=status.HTTP_204_NO_CONTENT)
    async def refresh(
        request: Request,
        response: Response,
        session=Depends(get_db_session),
        settings=Depends(get_settings),
    ) -> Response:
        raw_refresh_token = request.cookies.get(REFRESH_COOKIE_NAME)
        if not raw_refresh_token:
            raise ApiException("invalid_refresh_token", "Refresh session is invalid", 401)
        service = AuthService(settings)
        _, access_token, refresh_token = await service.refresh(session, raw_refresh_token)
        _set_auth_cookies(response, request, access_token, refresh_token)
        response.status_code = status.HTTP_204_NO_CONTENT
        return response

    @router.get("/me", response_model=UserResponse)
    async def me(
        request: Request,
        session=Depends(get_db_session),
    ) -> UserResponse:
        user = await get_current_user(request, session)
        return UserResponse(id=str(user.id), email=user.email, display_name=user.display_name)
