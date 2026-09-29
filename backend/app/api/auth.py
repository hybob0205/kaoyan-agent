from fastapi import APIRouter, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import CurrentUser, DatabaseSession
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.schemas.auth import AuthResponse, LoginRequest, RegisterRequest, UpdateAccountRequest, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: DatabaseSession) -> AuthResponse:
    user = User(
        username=payload.username.strip(),
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="用户名或邮箱已被使用") from None
    db.refresh(user)
    return AuthResponse(access_token=create_access_token(user.id, user.email), user=UserResponse.model_validate(user))


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: DatabaseSession) -> AuthResponse:
    normalized = payload.account.strip()
    user = db.scalar(select(User).where(or_(User.username == normalized, User.email == normalized.lower())))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="账号或密码错误")
    return AuthResponse(access_token=create_access_token(user.id, user.email), user=UserResponse.model_validate(user))


@router.get("/me", response_model=UserResponse)
def current_user(user: CurrentUser) -> UserResponse:
    return UserResponse.model_validate(user)


@router.put("/me", response_model=AuthResponse)
def update_current_user(payload: UpdateAccountRequest, user: CurrentUser, db: DatabaseSession) -> AuthResponse:
    user.username = payload.username.strip()
    user.email = payload.email.lower()
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="用户名或邮箱已被使用") from None
    db.refresh(user)
    return AuthResponse(access_token=create_access_token(user.id, user.email), user=UserResponse.model_validate(user))
