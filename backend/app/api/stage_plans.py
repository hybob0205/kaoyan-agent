from datetime import date, timedelta

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.dependencies import CurrentUser, DatabaseSession
from app.models.stage_plan import StagePhase, StagePlan
from app.schemas.stage_plan import (
    GenerateStagePlanRequest,
    StagePhaseResponse,
    StagePhaseUpdate,
    StagePlanResponse,
)
from app.services.plan_generator import SUBJECT_NAMES
from app.services.stage_plan_generator import generate_stage_drafts

router = APIRouter(tags=["plans"])


def load_active_stage_plan(db: DatabaseSession, user_id: int) -> StagePlan | None:
    return db.scalar(
        select(StagePlan)
        .options(selectinload(StagePlan.phases))
        .where(StagePlan.user_id == user_id, StagePlan.status == "active")
        .order_by(StagePlan.version.desc())
    )


@router.get("/plans/stages", response_model=StagePlanResponse)
def get_stage_plan(user: CurrentUser, db: DatabaseSession) -> StagePlanResponse:
    plan = load_active_stage_plan(db, user.id)
    if plan is None or user.profile is None or plan.exam_date != user.profile.exam_date:
        raise HTTPException(status_code=404, detail="还没有适用于当前目标的阶段计划")
    return StagePlanResponse.model_validate(plan)


@router.post("/plans/stages/generate", response_model=StagePlanResponse)
def generate_stage_plan(
    payload: GenerateStagePlanRequest,
    user: CurrentUser,
    db: DatabaseSession,
) -> StagePlanResponse:
    profile = user.profile
    levels = user.subject_levels
    if profile is None or len(levels) != 3:
        raise HTTPException(status_code=409, detail="请先完成学习画像再生成阶段计划")

    today = date.today()
    if profile.exam_date <= today:
        raise HTTPException(status_code=409, detail="考试日期已到，无法生成阶段计划")

    current = load_active_stage_plan(db, user.id)
    if current is not None and current.exam_date == profile.exam_date and not payload.regenerate:
        return StagePlanResponse.model_validate(current)

    drafts = generate_stage_drafts(profile, levels, today)
    weakest = min(levels, key=lambda level: (level.score, level.subject))
    rationale = (
        f"根据距考试 {(profile.exam_date - today).days} 天划分复习阶段，"
        f"结合三科基础，优先关注 {SUBJECT_NAMES[weakest.subject]}。"
        "阶段计划只定义复习重点；每日时长仍由日计划与周计划控制。"
    )
    version = 1
    if current is not None:
        current.status = "superseded"
        version = current.version + 1

    plan = StagePlan(
        user_id=user.id,
        start_date=today,
        end_date=profile.exam_date - timedelta(days=1),
        exam_date=profile.exam_date,
        status="active",
        version=version,
        rationale=rationale,
        phases=[
            StagePhase(
                sort_order=index,
                title=draft.title,
                start_date=draft.start_date,
                end_date=draft.end_date,
                math_focus=draft.math_focus,
                english_focus=draft.english_focus,
                politics_focus=draft.politics_focus,
            )
            for index, draft in enumerate(drafts)
        ],
    )
    db.add(plan)
    db.commit()
    saved = load_active_stage_plan(db, user.id)
    assert saved is not None
    return StagePlanResponse.model_validate(saved)


@router.patch("/plans/stages/{phase_id}", response_model=StagePhaseResponse)
def update_stage_phase(
    phase_id: int,
    payload: StagePhaseUpdate,
    user: CurrentUser,
    db: DatabaseSession,
) -> StagePhaseResponse:
    phase = db.scalar(
        select(StagePhase)
        .join(StagePlan)
        .where(
            StagePhase.id == phase_id,
            StagePlan.user_id == user.id,
            StagePlan.status == "active",
        )
    )
    if phase is None:
        raise HTTPException(status_code=404, detail="阶段不存在")
    if user.profile is None or phase.plan.exam_date != user.profile.exam_date:
        raise HTTPException(status_code=409, detail="考试目标已变更，请重新生成阶段计划")

    for field, value in payload.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(phase, field, value)
    db.commit()
    db.refresh(phase)
    return StagePhaseResponse.model_validate(phase)
