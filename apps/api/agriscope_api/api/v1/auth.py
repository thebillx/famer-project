"""Authentication API contracts."""

from __future__ import annotations

try:
    from fastapi import APIRouter, Response, status
    from pydantic import BaseModel, EmailStr, Field
except Exception:  # pragma: no cover
    APIRouter = None  # type: ignore[assignment]
    Response = object  # type: ignore[assignment]
    status = None  # type: ignore[assignment]

    class BaseModel:  # type: ignore[no-redef]
        pass

    def Field(*args, **kwargs):  # type: ignore[no-untyped-def]
        return None

    EmailStr = str  # type: ignore[assignment]


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12)
    display_name: str = Field(min_length=1, max_length=160)
    organization_name: str = Field(min_length=1, max_length=200)


class LoginRequest(BaseModel):
    email: EmailStr
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

    @router.post("/register", status_code=status.HTTP_201_CREATED, response_model=RegisterResponse)
    async def register(payload: RegisterRequest) -> RegisterResponse:
        raise NotImplementedError("Registration persistence is implemented through AuthService in this slice")

    @router.post("/login", status_code=status.HTTP_204_NO_CONTENT)
    async def login(payload: LoginRequest, response: Response) -> Response:
        raise NotImplementedError("Login persistence is implemented through AuthService in this slice")

    @router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
    async def logout(response: Response) -> Response:
        raise NotImplementedError("Logout requires refresh-session persistence")

    @router.post("/refresh", status_code=status.HTTP_204_NO_CONTENT)
    async def refresh(response: Response) -> Response:
        raise NotImplementedError("Refresh requires refresh-session persistence")

    @router.get("/me", response_model=UserResponse)
    async def me() -> UserResponse:
        raise NotImplementedError("Current-user dependency is implemented in this slice")
