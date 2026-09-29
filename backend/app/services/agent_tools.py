import json
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.plan import Plan, Review
from app.models.school_candidate import SchoolCandidate
from app.models.user import User


SUBJECT_NAMES = {"math2": "数学二", "english2": "英语二", "politics": "政治"}


class ControlledAgentTools:
    """A fixed, read-only tool surface. The model cannot choose SQL or arguments."""

    def __init__(self, db: Session, user_id: int) -> None:
        self.db = db
        self.user_id = user_id

    def profile_summary(self) -> str:
        user = self.db.scalar(
            select(User)
            .options(selectinload(User.profile), selectinload(User.subject_levels))
            .where(User.id == self.user_id)
        )
        if user is None or user.profile is None:
            return "用户尚未完成学习画像。"
        levels = "；".join(
            f"{SUBJECT_NAMES.get(item.subject, item.subject)} {item.score}/5"
            + (f"，薄弱点：{item.weaknesses}" if item.weaknesses else "")
            for item in user.subject_levels
        )
        return (
            f"目标：{user.profile.school} {user.profile.major}；考试日期：{user.profile.exam_date}；"
            f"每日可用 {user.profile.daily_minutes} 分钟；基础：{levels or '未填写'}。"
        )

    def today_plan(self) -> str:
        plan = self.db.scalar(
            select(Plan)
            .options(selectinload(Plan.tasks))
            .where(
                Plan.user_id == self.user_id,
                Plan.plan_type == "daily",
                Plan.start_date == date.today(),
                Plan.status == "active",
            )
            .order_by(Plan.version.desc())
        )
        if plan is None:
            return "今天尚未生成学习计划。"
        tasks = "；".join(
            f"{SUBJECT_NAMES.get(task.subject, task.subject)}《{task.title}》{task.minutes} 分钟（{task.status}）"
            for task in plan.tasks
        )
        return f"今日计划：{tasks or '休息日，无任务'}。安排依据：{plan.rationale}"

    def weekly_review(self) -> str:
        period_end = date.today()
        review = self.db.scalar(
            select(Review).where(
                Review.user_id == self.user_id,
                Review.period_start == period_end - timedelta(days=6),
                Review.period_end == period_end,
            )
        )
        if review is None:
            return "本周尚未生成周复盘。"
        metrics = json.loads(review.metrics_json)
        return (
            f"本周完成 {metrics.get('completed_tasks', 0)}/{metrics.get('planned_tasks', 0)} 项，"
            f"完成率 {metrics.get('completion_rate', 0)}%，实际投入 {metrics.get('actual_minutes', 0)} 分钟。"
            f"复盘结论：{review.content}"
        )

    def school_candidates(self) -> str:
        candidates = self.db.scalars(
            select(SchoolCandidate)
            .where(SchoolCandidate.user_id == self.user_id)
            .order_by(SchoolCandidate.updated_at.desc())
        ).all()
        if not candidates:
            return "用户尚未保存候选院校。"
        return "候选院校：" + "；".join(
            f"{item.school} - {item.major}，年份：{item.year or '未填写'}，复试线：{item.score_line if item.score_line is not None else '未填写'}分"
            + (f"，来源：{item.source}" if item.source else "")
            + (f"，备注：{item.note}" if item.note else "")
            for item in candidates
        )
