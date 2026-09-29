from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    profile: Mapped["StudyProfile | None"] = relationship(back_populates="user", cascade="all, delete-orphan", uselist=False)
    subject_levels: Mapped[list["SubjectLevel"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    plans: Mapped[list["Plan"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    stage_plans: Mapped[list["StagePlan"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    checkins: Mapped[list["Checkin"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    reviews: Mapped[list["Review"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    quizzes: Mapped[list["Quiz"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    model_config_entry: Mapped["ModelConfig | None"] = relationship(back_populates="user", cascade="all, delete-orphan", uselist=False)
    documents: Mapped[list["KnowledgeDocument"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    agent_conversations: Mapped[list["AgentConversation"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    school_candidates: Mapped[list["SchoolCandidate"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class StudyProfile(Base):
    __tablename__ = "study_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)
    exam_date: Mapped[date] = mapped_column(Date)
    school: Mapped[str] = mapped_column(String(120))
    major: Mapped[str] = mapped_column(String(120))
    daily_minutes: Mapped[int] = mapped_column(Integer)
    rest_days: Mapped[str] = mapped_column(String(80), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user: Mapped[User] = relationship(back_populates="profile")


class SubjectLevel(Base):
    __tablename__ = "subject_levels"
    __table_args__ = (UniqueConstraint("user_id", "subject", name="uq_subject_level_user_subject"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    subject: Mapped[str] = mapped_column(String(20))
    score: Mapped[int] = mapped_column(Integer)
    weaknesses: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user: Mapped[User] = relationship(back_populates="subject_levels")
