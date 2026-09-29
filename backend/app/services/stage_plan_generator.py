from dataclasses import dataclass
from datetime import date, timedelta

from app.models.user import StudyProfile, SubjectLevel
from app.services.plan_generator import DEFAULT_FOCUS


@dataclass(frozen=True)
class StageDraft:
    title: str
    start_date: date
    end_date: date
    math_focus: str
    english_focus: str
    politics_focus: str


def generate_stage_drafts(
    profile: StudyProfile,
    levels: list[SubjectLevel],
    start_date: date,
) -> list[StageDraft]:
    remaining_days = (profile.exam_date - start_date).days
    if remaining_days <= 0:
        return []

    if remaining_days >= 70:
        phase_specs = [
            ("基础夯实", remaining_days * 50 // 100),
            ("专项强化", remaining_days * 35 // 100),
            ("冲刺复盘", 0),
        ]
    elif remaining_days >= 14:
        phase_specs = [("专项强化", remaining_days * 65 // 100), ("冲刺复盘", 0)]
    else:
        phase_specs = [("冲刺复盘", 0)]

    focuses = {
        level.subject: level.weaknesses.strip() or DEFAULT_FOCUS[level.subject]
        for level in levels
    }
    drafts: list[StageDraft] = []
    cursor = start_date
    for index, (title, length) in enumerate(phase_specs):
        if index == len(phase_specs) - 1:
            end_date = profile.exam_date - timedelta(days=1)
        else:
            end_date = cursor + timedelta(days=length - 1)

        if title == "基础夯实":
            math_focus = f"梳理{focuses['math2']}，完成基础例题并建立错题清单。"
            english_focus = f"复习{focuses['english2']}，巩固词汇与阅读基础。"
            politics_focus = f"梳理{focuses['politics']}，建立知识框架并复述核心概念。"
        elif title == "专项强化":
            math_focus = f"围绕{focuses['math2']}做专题训练，整理易错题型。"
            english_focus = f"围绕{focuses['english2']}做限时练习，复盘失分原因。"
            politics_focus = f"围绕{focuses['politics']}做章节练习，归纳易混考点。"
        else:
            math_focus = "按考试时间完成数学二真题或套卷，集中复盘错题。"
            english_focus = "限时完成英语二真题，复盘阅读、翻译与写作。"
            politics_focus = "复习高频考点与主观题，时效信息以官方来源为准。"

        drafts.append(
            StageDraft(
                title=title,
                start_date=cursor,
                end_date=end_date,
                math_focus=math_focus,
                english_focus=english_focus,
                politics_focus=politics_focus,
            )
        )
        cursor = end_date + timedelta(days=1)

    return drafts
