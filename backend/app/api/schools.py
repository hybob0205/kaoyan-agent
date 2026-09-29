from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select

from app.api.dependencies import CurrentUser, DatabaseSession
from app.models.school_candidate import SchoolCandidate
from app.schemas.school import SchoolCandidateInput, SchoolCandidateResponse

router = APIRouter(prefix="/schools", tags=["schools"])


@router.get("", response_model=list[SchoolCandidateResponse])
def list_candidates(user: CurrentUser, db: DatabaseSession) -> list[SchoolCandidate]:
    return list(db.scalars(select(SchoolCandidate).where(SchoolCandidate.user_id == user.id).order_by(SchoolCandidate.updated_at.desc())).all())


@router.post("", response_model=SchoolCandidateResponse, status_code=status.HTTP_201_CREATED)
def create_candidate(payload: SchoolCandidateInput, user: CurrentUser, db: DatabaseSession) -> SchoolCandidate:
    candidate = SchoolCandidate(user_id=user.id, **payload.model_dump())
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    return candidate


@router.put("/{candidate_id}", response_model=SchoolCandidateResponse)
def update_candidate(candidate_id: int, payload: SchoolCandidateInput, user: CurrentUser, db: DatabaseSession) -> SchoolCandidate:
    candidate = db.scalar(select(SchoolCandidate).where(SchoolCandidate.id == candidate_id, SchoolCandidate.user_id == user.id))
    if candidate is None:
        raise HTTPException(status_code=404, detail="候选院校不存在")
    for field, value in payload.model_dump().items():
        setattr(candidate, field, value)
    db.commit()
    db.refresh(candidate)
    return candidate


@router.delete("/{candidate_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_candidate(candidate_id: int, user: CurrentUser, db: DatabaseSession) -> Response:
    candidate = db.scalar(select(SchoolCandidate).where(SchoolCandidate.id == candidate_id, SchoolCandidate.user_id == user.id))
    if candidate is None:
        raise HTTPException(status_code=404, detail="候选院校不存在")
    db.delete(candidate)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
