from dataclasses import dataclass
from datetime import date

from app.models.user import StudyProfile, SubjectLevel


@dataclass(frozen=True)
class TaskDraft:
    subject: str
    title: str
    minutes: int
    priority: int


DEFAULT_FOCUS = {
    "math2": "基础知识与例题训练",
    "english2": "词汇复习与阅读训练",
    "politics": "核心考点理解与背诵",
}
SUBJECT_NAMES = {"math2": "数学二", "english2": "英语二", "politics": "政治"}


def _allocate_minutes(total: int, levels: list[SubjectLevel]) -> list[int]:
    task_count = min(len(levels), max(1, total // 30))
    selected = levels[:task_count]
    minimum = 25
    allocations = [minimum] * task_count
    remaining = total - minimum * task_count
    weights = [6 - level.score for level in selected]

    while remaining >= 5:
        target = max(range(task_count), key=lambda index: weights[index] / allocations[index])
        allocations[target] += 5
        remaining -= 5
    return allocations


def generate_daily_task_drafts(
    profile: StudyProfile,
    levels: list[SubjectLevel],
    plan_date: date,
) -> tuple[list[TaskDraft], str]:
    rest_days = {int(day) for day in profile.rest_days.split(",") if day}
    if plan_date.weekday() in rest_days:
        return [], "今天是你设定的固定休息日，计划留空以保证恢复；如需学习，可手动添加轻量复习任务。"

    ordered = sorted(levels, key=lambda level: (level.score, level.subject))
    allocations = _allocate_minutes(profile.daily_minutes, ordered)
    drafts: list[TaskDraft] = []
    selected = ordered[: len(allocations)]
    for index, (level, minutes) in enumerate(zip(selected, allocations, strict=True)):
        focus = level.weaknesses.strip() or DEFAULT_FOCUS[level.subject]
        drafts.append(
            TaskDraft(
                subject=level.subject,
                title=f"{focus}：学习与练习",
                minutes=minutes,
                priority=1 if index == 0 else 2,
            )
        )

    weakest = ordered[0]
    rationale = (
        f"根据每日 {profile.daily_minutes} 分钟上限安排，优先照顾基础评分最低的科目"
        f"（{SUBJECT_NAMES[weakest.subject]}，{weakest.score}/5）；总时长不超过可用时间。"
    )
    return drafts, rationale
