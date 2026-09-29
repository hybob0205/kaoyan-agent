from fastapi import APIRouter, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from app.api.dependencies import CurrentUser, DatabaseSession
from app.models.user import StudyProfile, SubjectLevel, User
from app.schemas.profile import ProfileResponse, ProfileUpsertRequest, SubjectLevelResponse

router = APIRouter(prefix="/profile", tags=["profile"])


def serialize_profile(user: User) -> ProfileResponse:
    if user.profile is None:
        raise HTTPException(status_code=404, detail="尚未完成学习建档")
    return ProfileResponse(
        exam_date=user.profile.exam_date,
        school=user.profile.school,
        major=user.profile.major,
        daily_minutes=user.profile.daily_minutes,
        rest_days=[int(day) for day in user.profile.rest_days.split(",") if day],
        subjects=[SubjectLevelResponse.model_validate(level) for level in user.subject_levels],
    )


@router.get("", response_model=ProfileResponse)
def get_profile(user: CurrentUser, db: DatabaseSession) -> ProfileResponse:
    loaded = db.scalar(
        select(User)
        .options(selectinload(User.profile), selectinload(User.subject_levels))
        .where(User.id == user.id)
    )
    assert loaded is not None
    return serialize_profile(loaded)


@router.put("", response_model=ProfileResponse)
def upsert_profile(payload: ProfileUpsertRequest, user: CurrentUser, db: DatabaseSession) -> ProfileResponse:
    profile = db.scalar(select(StudyProfile).where(StudyProfile.user_id == user.id))
    values = {
        "exam_date": payload.exam_date,
        "school": payload.school.strip(),
        "major": payload.major.strip(),
        "daily_minutes": payload.daily_minutes,
        "rest_days": ",".join(str(day) for day in sorted(payload.rest_days)),
    }
    if profile is None:
        profile = StudyProfile(user_id=user.id, **values)
        db.add(profile)
    else:
        for field, value in values.items():
            setattr(profile, field, value)

    db.execute(delete(SubjectLevel).where(SubjectLevel.user_id == user.id))
    db.add_all(
        SubjectLevel(user_id=user.id, subject=item.subject, score=item.score, weaknesses=item.weaknesses.strip())
        for item in payload.subjects
    )
    db.commit()

    loaded = db.scalar(
        select(User)
        .options(selectinload(User.profile), selectinload(User.subject_levels))
        .where(User.id == user.id)
    )
    assert loaded is not None
    return serialize_profile(loaded)
