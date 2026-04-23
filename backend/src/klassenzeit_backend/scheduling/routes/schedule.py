"""POST /api/classes/{class_id}/schedule: run the solver for a single class."""

import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.auth.dependencies import require_admin
from klassenzeit_backend.db.models.user import User
from klassenzeit_backend.db.session import get_session
from klassenzeit_backend.scheduling import solver_io
from klassenzeit_backend.scheduling.schemas.schedule import ScheduleResponse

router = APIRouter(tags=["schedule"])
logger = logging.getLogger(__name__)


@router.post("/classes/{class_id}/schedule")
async def generate_schedule_for_class(
    class_id: uuid.UUID,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> ScheduleResponse:
    """Run the solver for the given class and return per-class placements and violations.

    Args:
        class_id: UUID path parameter identifying the school class.
        _admin: Injected admin user (enforces authentication).
        db: Injected async database session.

    Returns:
        ``ScheduleResponse`` with placements and violations scoped to this class.

    Raises:
        HTTPException: 404 if the class doesn't exist; 422 if the class's
            week_scheme has no time_blocks, if other classes in the solve use a
            different week_scheme, or if the rooms table is empty.
    """
    problem_json, class_lesson_ids, input_counts = await solver_io.build_problem_json(db, class_id)
    solution = await solver_io.run_solve(problem_json, class_id, input_counts)
    filtered = solver_io.filter_solution_for_class(solution, class_lesson_ids)
    logger.info(
        "solver.solve.filtered",
        extra={
            "school_class_id": str(class_id),
            "placements_for_class": len(filtered["placements"]),
            "violations_for_class": len(filtered["violations"]),
        },
    )
    return ScheduleResponse.model_validate(filtered)
