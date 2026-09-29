from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.dependencies import CurrentUser, DatabaseSession
from app.models.plan import Plan, Task
from app.models.user import User
from app.schemas.plan import (
    AdjustNextDayRequest,
    GeneratePlanRequest,
    GenerateWeeklyPlanRequest,
    PlanResponse,
    TaskCreateRequest,
    TaskResponse,
    TaskUpdateRequest,
)
from app.services.plan_generator import TaskDraft, generate_daily_task_drafts

router = APIRouter(tags=["plans"])


def serialize_plan(plan: Plan) -> PlanResponse:
    total_minutes = sum(task.minutes for task in plan.tasks)
    completed_minutes = sum(task.minutes for task in plan.tasks if task.status == "completed")
    return PlanResponse(
        id=plan.id,
        plan_type=plan.plan_type,
        start_date=plan.start_date,
        end_date=plan.end_date,
        status=plan.status,
        rationale=plan.rationale,
        version=plan.version,
        total_minutes=total_minutes,
        completed_minutes=completed_minutes,
        tasks=[TaskResponse.model_validate(task) for task in plan.tasks],
    )


def load_plan_for_date(db: DatabaseSession, user_id: int, plan_date: date) -> Plan | None:
    return db.scalar(
        select(Plan)
        .options(selectinload(Plan.tasks))
        .where(
            Plan.user_id == user_id,
            Plan.plan_type == "daily",
            Plan.start_date == plan_date,
            Plan.status == "active",
        )
        .order_by(Plan.version.desc())
    )


def current_week_start() -> date:
    today = date.today()
    return today - timedelta(days=today.weekday())


def load_current_week_plan(db: DatabaseSession, user_id: int) -> Plan | None:
    return db.scalar(
        select(Plan)
        .options(selectinload(Plan.tasks))
        .where(
            Plan.user_id == user_id,
            Plan.plan_type == "weekly",
            Plan.start_date == current_week_start(),
            Plan.status == "active",
        )
        .order_by(Plan.version.desc())
    )


@router.get("/plans/week", response_model=PlanResponse)
def get_current_week_plan(user: CurrentUser, db: DatabaseSession) -> PlanResponse:
    plan = load_current_week_plan(db, user.id)
    if plan is None:
        raise HTTPException(status_code=404, detail="本周还没有学习计划")
    return serialize_plan(plan)


@router.post("/plans/week/generate", response_model=PlanResponse)
def generate_current_week_plan(
    payload: GenerateWeeklyPlanRequest,
    user: CurrentUser,
    db: DatabaseSession,
) -> PlanResponse:
    current = load_current_week_plan(db, user.id)
    if current is not None and not payload.regenerate:
        return serialize_plan(current)

    loaded_user = db.scalar(
        select(User)
        .options(selectinload(User.profile), selectinload(User.subject_levels))
        .where(User.id == user.id)
    )
    assert loaded_user is not None
    if loaded_user.profile is None or len(loaded_user.subject_levels) != 3:
        raise HTTPException(status_code=409, detail="请先完成学习画像再生成周计划")

    today = date.today()
    week_start = current_week_start()
    week_end = week_start + timedelta(days=6)
    if today >= loaded_user.profile.exam_date:
        raise HTTPException(status_code=409, detail="考试日期已到，无法生成后续周计划")
    week_end = min(week_end, loaded_user.profile.exam_date - timedelta(days=1))
    first_day = max(week_start, today)
    tasks: list[Task] = []
    for day_offset in range((week_end - first_day).days + 1):
        plan_date = first_day + timedelta(days=day_offset)
        drafts, _ = generate_daily_task_drafts(
            loaded_user.profile,
            loaded_user.subject_levels,
            plan_date,
        )
        for draft in drafts:
            tasks.append(
                Task(
                    subject=draft.subject,
                    title=draft.title,
                    minutes=draft.minutes,
                    due_date=plan_date,
                    priority=draft.priority,
                    sort_order=len(tasks),
                )
            )

    rationale = (
        f"本周计划按每日可用时间 {loaded_user.profile.daily_minutes} 分钟生成，"
        "遵循固定休息日，并在考试日期前结束。"
    )
    version = 1
    if current is not None:
        current.status = "superseded"
        version = current.version + 1
    plan = Plan(
        user_id=user.id,
        plan_type="weekly",
        start_date=week_start,
        end_date=week_end,
        status="active",
        rationale=rationale,
        version=version,
        tasks=tasks,
    )
    db.add(plan)
    db.commit()
    created = load_current_week_plan(db, user.id)
    assert created is not None
    return serialize_plan(created)


@router.get("/plans/today", response_model=PlanResponse)
def get_today_plan(user: CurrentUser, db: DatabaseSession) -> PlanResponse:
    plan = load_plan_for_date(db, user.id, date.today())
    if plan is None:
        raise HTTPException(status_code=404, detail="今天还没有学习计划")
    return serialize_plan(plan)


@router.get("/plans/next-day", response_model=PlanResponse)
def get_next_day_plan(user: CurrentUser, db: DatabaseSession) -> PlanResponse:
    plan = load_plan_for_date(db, user.id, date.today() + timedelta(days=1))
    if plan is None:
        raise HTTPException(status_code=404, detail="明天还没有调整计划")
    return serialize_plan(plan)


@router.post("/plans/generate", response_model=PlanResponse)
def generate_plan(payload: GeneratePlanRequest, user: CurrentUser, db: DatabaseSession) -> PlanResponse:
    current = load_plan_for_date(db, user.id, date.today())
    if current is not None and not payload.regenerate:
        return serialize_plan(current)

    loaded_user = db.scalar(
        select(User)
        .options(selectinload(User.profile), selectinload(User.subject_levels))
        .where(User.id == user.id)
    )
    assert loaded_user is not None
    if loaded_user.profile is None or len(loaded_user.subject_levels) != 3:
        raise HTTPException(status_code=409, detail="请先完成学习画像再生成计划")

    version = 1
    if current is not None:
        current.status = "superseded"
        version = current.version + 1

    drafts, rationale = generate_daily_task_drafts(
        loaded_user.profile,
        loaded_user.subject_levels,
        date.today(),
    )
    plan = Plan(
        user_id=user.id,
        plan_type="daily",
        start_date=date.today(),
        end_date=date.today(),
        status="active",
        rationale=rationale,
        version=version,
    )
    plan.tasks = [
        Task(
            subject=draft.subject,
            title=draft.title,
            minutes=draft.minutes,
            due_date=date.today(),
            priority=draft.priority,
            sort_order=index,
        )
        for index, draft in enumerate(drafts)
    ]
    db.add(plan)
    db.commit()
    db.refresh(plan)
    plan = load_plan_for_date(db, user.id, date.today())
    assert plan is not None
    return serialize_plan(plan)


@router.post("/plans/adjust-next-day", response_model=PlanResponse)
def adjust_next_day_plan(
    payload: AdjustNextDayRequest,
    user: CurrentUser,
    db: DatabaseSession,
) -> PlanResponse:
    tomorrow = date.today() + timedelta(days=1)
    current = load_plan_for_date(db, user.id, tomorrow)
    if current is not None and not payload.regenerate:
        return serialize_plan(current)

    loaded_user = db.scalar(
        select(User)
        .options(selectinload(User.profile), selectinload(User.subject_levels))
        .where(User.id == user.id)
    )
    assert loaded_user is not None
    if loaded_user.profile is None or len(loaded_user.subject_levels) != 3:
        raise HTTPException(status_code=409, detail="请先完成学习画像")

    skipped_tasks = list(
        db.scalars(
            select(Task)
            .join(Plan)
            .where(
                Plan.user_id == user.id,
                Plan.start_date == date.today(),
                Plan.status == "active",
                Task.status == "skipped",
            )
            .order_by(Task.sort_order)
        )
    )
    normal_drafts, normal_reason = generate_daily_task_drafts(
        loaded_user.profile,
        loaded_user.subject_levels,
        tomorrow,
    )
    available = loaded_user.profile.daily_minutes
    carry_drafts: list[TaskDraft] = []
    rest_days = {int(day) for day in loaded_user.profile.rest_days.split(",") if day}
    if skipped_tasks and tomorrow.weekday() not in rest_days:
        carry_budget = min(available, max(30, available * 2 // 5))
        each_budget = max(5, carry_budget // len(skipped_tasks) // 5 * 5)
        for task in skipped_tasks:
            minutes = min(task.minutes, 45, each_budget)
            carry_drafts.append(
                TaskDraft(
                    subject=task.subject,
                    title=f"顺延：{task.title}",
                    minutes=minutes,
                    priority=1,
                )
            )

    remaining = max(0, available - sum(draft.minutes for draft in carry_drafts))
    adjusted_normal: list[TaskDraft] = []
    for draft in normal_drafts:
        if remaining < 20:
            break
        minutes = min(draft.minutes, remaining)
        minutes = minutes // 5 * 5
        if minutes >= 20:
            adjusted_normal.append(
                TaskDraft(
                    subject=draft.subject,
                    title=draft.title,
                    minutes=minutes,
                    priority=max(2, draft.priority),
                )
            )
            remaining -= minutes

    version = 1
    if current is not None:
        current.status = "superseded"
        version = current.version + 1
    drafts = carry_drafts + adjusted_normal
    rationale = normal_reason
    if carry_drafts:
        rationale = (
            f"检测到 {len(carry_drafts)} 项未完成任务，已优先拆分顺延，并压缩普通任务，"
            f"确保明日总时长不超过 {available} 分钟。"
        )
    plan = Plan(
        user_id=user.id,
        plan_type="daily",
        start_date=tomorrow,
        end_date=tomorrow,
        status="active",
        rationale=rationale,
        version=version,
        tasks=[
            Task(
                subject=draft.subject,
                title=draft.title,
                minutes=draft.minutes,
                due_date=tomorrow,
                priority=draft.priority,
                sort_order=index,
            )
            for index, draft in enumerate(drafts)
        ],
    )
    db.add(plan)
    db.commit()
    adjusted = load_plan_for_date(db, user.id, tomorrow)
    assert adjusted is not None
    return serialize_plan(adjusted)


@router.post("/plans/today/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_today_task(
    payload: TaskCreateRequest,
    user: CurrentUser,
    db: DatabaseSession,
) -> TaskResponse:
    plan = load_plan_for_date(db, user.id, date.today())
    if plan is None:
        raise HTTPException(status_code=404, detail="请先生成今日计划")
    if user.profile is None:
        raise HTTPException(status_code=409, detail="请先完成学习画像")
    if sum(task.minutes for task in plan.tasks) + payload.minutes > user.profile.daily_minutes:
        raise HTTPException(status_code=422, detail="任务总时长不能超过每日可用时间")

    task = Task(
        plan_id=plan.id,
        subject=payload.subject,
        title=payload.title,
        minutes=payload.minutes,
        due_date=date.today(),
        priority=2,
        sort_order=max((item.sort_order for item in plan.tasks), default=-1) + 1,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return TaskResponse.model_validate(task)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: int, user: CurrentUser, db: DatabaseSession) -> None:
    task = db.scalar(
        select(Task)
        .join(Plan)
        .options(selectinload(Task.checkin))
        .where(
            Task.id == task_id,
            Plan.user_id == user.id,
            Plan.plan_type == "daily",
            Plan.start_date == date.today(),
            Plan.status == "active",
        )
    )
    if task is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    if task.status != "pending" or task.checkin is not None:
        raise HTTPException(status_code=409, detail="已有打卡记录的任务不能删除")
    db.delete(task)
    db.commit()


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: int,
    payload: TaskUpdateRequest,
    user: CurrentUser,
    db: DatabaseSession,
) -> TaskResponse:
    task = db.scalar(
        select(Task)
        .join(Plan)
        .options(selectinload(Task.plan).selectinload(Plan.tasks))
        .where(Task.id == task_id, Plan.user_id == user.id, Plan.status == "active")
    )
    if task is None:
        raise HTTPException(status_code=404, detail="任务不存在")

    values = payload.model_dump(exclude_unset=True)
    if "minutes" in values:
        profile = user.profile
        if profile is None:
            raise HTTPException(status_code=409, detail="请先完成学习画像")
        other_minutes = sum(item.minutes for item in task.plan.tasks if item.id != task.id)
        if other_minutes + values["minutes"] > profile.daily_minutes:
            raise HTTPException(status_code=422, detail="任务总时长不能超过每日可用时间")

    for field, value in values.items():
        if field == "title":
            value = value.strip()
        setattr(task, field, value)
    db.commit()
    db.refresh(task)
    return TaskResponse.model_validate(task)
