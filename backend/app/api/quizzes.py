import json
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.api.dependencies import CurrentUser, DatabaseSession
from app.core.secrets import decrypt_secret
from app.models.model_config import ModelConfig
from app.models.quiz import Quiz
from app.schemas.quiz import (
    GenerateQuizRequest,
    QuizAnalysisResponse,
    QuizFeedbackRequest,
    QuizQuestionResponse,
    QuizResponse,
    QuizSubjectPerformance,
    QuizTopicPerformance,
    SubmitQuizRequest,
)
from app.services.model_provider import build_provider
from app.services.quiz_generator import generate_math_quiz, generate_quiz, serialize_quiz

router = APIRouter(prefix="/quizzes", tags=["quizzes"])


def quiz_response(quiz: Quiz) -> QuizResponse:
    questions = json.loads(quiz.questions_json)
    answers = json.loads(quiz.answers_json) if quiz.answers_json is not None else None
    revealed = answers is not None
    return QuizResponse(
        id=quiz.id,
        subject=quiz.subject,
        topic=quiz.topic,
        created_at=quiz.created_at,
        submitted_at=quiz.submitted_at,
        score=quiz.score,
        total=len(questions),
        questions=[
            QuizQuestionResponse(
                stem=item["stem"],
                options=item["options"],
                answer_index=item["answer_index"] if revealed else None,
                explanation=item["explanation"] if revealed else None,
                selected_index=answers[index] if revealed else None,
                feedback=item.get("feedback") if revealed else None,
            ) for index, item in enumerate(questions)
        ],
    )


@router.get("", response_model=list[QuizResponse])
def list_quizzes(user: CurrentUser, db: DatabaseSession) -> list[QuizResponse]:
    quizzes = db.scalars(select(Quiz).where(Quiz.user_id == user.id).order_by(Quiz.id.desc()).limit(20)).all()
    return [quiz_response(item) for item in quizzes]


@router.get("/analysis", response_model=QuizAnalysisResponse)
def get_quiz_analysis(user: CurrentUser, db: DatabaseSession) -> QuizAnalysisResponse:
    quizzes = list(db.scalars(select(Quiz).where(Quiz.user_id == user.id, Quiz.submitted_at.is_not(None))))
    subject_totals: dict[str, dict[str, int]] = {}
    topic_totals: dict[tuple[str, str], dict[str, int]] = {}
    for quiz in quizzes:
        total = len(json.loads(quiz.questions_json))
        correct = quiz.score or 0
        for totals in (
            subject_totals.setdefault(quiz.subject, {"quizzes": 0, "correct": 0, "total": 0}),
            topic_totals.setdefault((quiz.subject, quiz.topic), {"quizzes": 0, "correct": 0, "total": 0}),
        ):
            totals["quizzes"] += 1
            totals["correct"] += correct
            totals["total"] += total

    def accuracy(correct: int, total: int) -> int:
        return round(correct / total * 100) if total else 0

    subjects = [
        QuizSubjectPerformance(
            subject=subject,
            submitted_quizzes=totals["quizzes"],
            correct_answers=totals["correct"],
            total_questions=totals["total"],
            accuracy=accuracy(totals["correct"], totals["total"]),
        )
        for subject, totals in sorted(subject_totals.items())
    ]
    topics = [
        QuizTopicPerformance(
            subject=subject,
            topic=topic,
            submitted_quizzes=totals["quizzes"],
            correct_answers=totals["correct"],
            total_questions=totals["total"],
            accuracy=accuracy(totals["correct"], totals["total"]),
        )
        for (subject, topic), totals in topic_totals.items()
    ]
    topics.sort(key=lambda item: (item.accuracy, -item.total_questions, item.topic))
    weak_topics = [item for item in topics if item.accuracy < 80][:3]
    total_questions = sum(item.total_questions for item in subjects)
    correct_answers = sum(item.correct_answers for item in subjects)
    overall_accuracy = accuracy(correct_answers, total_questions)
    if not quizzes:
        recommendation = "完成至少一次模拟测试后，这里会根据真实作答记录分析薄弱知识点。"
    elif weak_topics:
        weakest = weak_topics[0]
        recommendation = f"建议优先复习“{weakest.topic}”：当前正确率 {weakest.accuracy}%，复习后再做一组同范围练习。"
    else:
        recommendation = f"当前整体正确率为 {overall_accuracy}%，暂未发现低于 80% 的知识点，建议继续轮换科目巩固。"
    return QuizAnalysisResponse(
        submitted_quizzes=len(quizzes),
        correct_answers=correct_answers,
        total_questions=total_questions,
        accuracy=overall_accuracy,
        subjects=subjects,
        topics=topics,
        weak_topics=weak_topics,
        recommendation=recommendation,
    )


@router.get("/{quiz_id}", response_model=QuizResponse)
def get_quiz(quiz_id: int, user: CurrentUser, db: DatabaseSession) -> QuizResponse:
    quiz = db.scalar(select(Quiz).where(Quiz.id == quiz_id, Quiz.user_id == user.id))
    if quiz is None:
        raise HTTPException(status_code=404, detail="测试不存在")
    return quiz_response(quiz)


@router.post("", response_model=QuizResponse, status_code=201)
async def create_quiz(payload: GenerateQuizRequest, user: CurrentUser, db: DatabaseSession) -> QuizResponse:
    if payload.subject == "math2":
        try:
            generated = generate_math_quiz(payload.topic)
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
    else:
        config = db.scalar(select(ModelConfig).where(ModelConfig.user_id == user.id))
        if config is None:
            raise HTTPException(status_code=409, detail="请先配置对话模型")
        try:
            api_key = decrypt_secret(config.secret_ciphertext)
        except ValueError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        provider = build_provider(config.provider, config.base_url, config.model, config.embedding_model, api_key)
        try:
            generated = await generate_quiz(provider, payload.subject, payload.topic, config.temperature)
        except httpx.HTTPStatusError as error:
            raise HTTPException(status_code=502, detail=f"模型生成失败（HTTP {error.response.status_code}）") from error
        except httpx.RequestError as error:
            raise HTTPException(status_code=502, detail="无法连接模型服务") from error
        except (ValueError, KeyError, TypeError) as error:
            raise HTTPException(status_code=502, detail="模型未能生成有效试题，请缩小范围后重试") from error
        finally:
            await provider.close()
    quiz = Quiz(user_id=user.id, subject=payload.subject, topic=payload.topic, questions_json=serialize_quiz(generated))
    db.add(quiz)
    db.commit()
    db.refresh(quiz)
    return quiz_response(quiz)


@router.post("/{quiz_id}/submit", response_model=QuizResponse)
def submit_quiz(quiz_id: int, payload: SubmitQuizRequest, user: CurrentUser, db: DatabaseSession) -> QuizResponse:
    quiz = db.scalar(select(Quiz).where(Quiz.id == quiz_id, Quiz.user_id == user.id))
    if quiz is None:
        raise HTTPException(status_code=404, detail="测试不存在")
    if quiz.submitted_at is not None:
        raise HTTPException(status_code=409, detail="这份测试已经提交")
    questions = json.loads(quiz.questions_json)
    if len(payload.answers) != len(questions) or any(answer < 0 or answer > 3 for answer in payload.answers):
        raise HTTPException(status_code=422, detail="请完成全部题目再提交")
    quiz.answers_json = json.dumps(payload.answers)
    quiz.score = sum(answer == question["answer_index"] for answer, question in zip(payload.answers, questions))
    quiz.submitted_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(quiz)
    return quiz_response(quiz)


@router.post("/{quiz_id}/feedback", response_model=QuizResponse)
def save_quiz_feedback(
    quiz_id: int,
    payload: QuizFeedbackRequest,
    user: CurrentUser,
    db: DatabaseSession,
) -> QuizResponse:
    quiz = db.scalar(select(Quiz).where(Quiz.id == quiz_id, Quiz.user_id == user.id))
    if quiz is None:
        raise HTTPException(status_code=404, detail="测试不存在")
    if quiz.submitted_at is None:
        raise HTTPException(status_code=409, detail="请先交卷，再反馈题目质量")
    questions = json.loads(quiz.questions_json)
    if payload.question_index >= len(questions):
        raise HTTPException(status_code=422, detail="题目序号无效")
    questions[payload.question_index]["feedback"] = {
        "category": payload.category,
        "note": payload.note,
    }
    quiz.questions_json = json.dumps(questions, ensure_ascii=False)
    db.commit()
    db.refresh(quiz)
    return quiz_response(quiz)
