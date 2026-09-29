from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class GenerateQuizRequest(BaseModel):
    subject: str = Field(pattern="^(math2|english2|politics)$")
    topic: str = Field(min_length=2, max_length=120)

    model_config = ConfigDict(str_strip_whitespace=True)


class GeneratedQuestion(BaseModel):
    stem: str = Field(min_length=8, max_length=500)
    options: list[str] = Field(min_length=4, max_length=4)
    answer_index: int = Field(ge=0, le=3)
    explanation: str = Field(min_length=5, max_length=500)

    model_config = ConfigDict(str_strip_whitespace=True)


class GeneratedQuiz(BaseModel):
    questions: list[GeneratedQuestion] = Field(min_length=3, max_length=3)


class SubmitQuizRequest(BaseModel):
    answers: list[int] = Field(min_length=3, max_length=3)


FeedbackCategory = Literal["wrong_answer", "unclear", "ambiguous", "outdated", "other"]


class QuizFeedbackRequest(BaseModel):
    question_index: int = Field(ge=0)
    category: FeedbackCategory
    note: str = Field(default="", max_length=500)

    model_config = ConfigDict(str_strip_whitespace=True)


class QuizFeedbackResponse(BaseModel):
    category: FeedbackCategory
    note: str


class QuizQuestionResponse(BaseModel):
    stem: str
    options: list[str]
    answer_index: int | None = None
    explanation: str | None = None
    selected_index: int | None = None
    feedback: QuizFeedbackResponse | None = None


class QuizResponse(BaseModel):
    id: int
    subject: str
    topic: str
    created_at: datetime
    submitted_at: datetime | None
    score: int | None
    total: int
    questions: list[QuizQuestionResponse]


class QuizSubjectPerformance(BaseModel):
    subject: str
    submitted_quizzes: int
    correct_answers: int
    total_questions: int
    accuracy: int


class QuizTopicPerformance(QuizSubjectPerformance):
    topic: str


class QuizAnalysisResponse(BaseModel):
    submitted_quizzes: int
    correct_answers: int
    total_questions: int
    accuracy: int
    subjects: list[QuizSubjectPerformance]
    topics: list[QuizTopicPerformance]
    weak_topics: list[QuizTopicPerformance]
    recommendation: str
