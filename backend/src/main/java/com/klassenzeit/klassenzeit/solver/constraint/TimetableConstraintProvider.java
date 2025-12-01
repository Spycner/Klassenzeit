package com.klassenzeit.klassenzeit.solver.constraint;

import ai.timefold.solver.core.api.score.buildin.hardsoft.HardSoftScore;
import ai.timefold.solver.core.api.score.stream.Constraint;
import ai.timefold.solver.core.api.score.stream.ConstraintFactory;
import ai.timefold.solver.core.api.score.stream.ConstraintProvider;
import ai.timefold.solver.core.api.score.stream.Joiners;
import com.klassenzeit.klassenzeit.solver.domain.PlanningLesson;

/**
 * Defines constraints for timetabling optimization.
 *
 * <p>Hard constraints must be satisfied (violations make the solution invalid):
 *
 * <ul>
 *   <li>Teacher cannot teach two lessons at the same time
 *   <li>Room cannot host two lessons at the same time
 *   <li>Class cannot have two lessons at the same time
 *   <li>Teacher cannot teach when blocked
 *   <li>Room capacity must fit class size
 *   <li>Teacher must be qualified to teach subject at grade level
 * </ul>
 *
 * <p>Soft constraints are optimized (violations are minimized):
 *
 * <ul>
 *   <li>Teacher prefers certain time slots
 *   <li>Minimize gaps in teacher schedules
 *   <li>Avoid multiple lessons of same subject on same day for a class
 *   <li>Prefer class teacher for first period
 * </ul>
 */
public class TimetableConstraintProvider implements ConstraintProvider {

  @Override
  public Constraint[] defineConstraints(ConstraintFactory constraintFactory) {
    return new Constraint[] {
      // Hard constraints
      teacherConflict(constraintFactory),
      roomConflict(constraintFactory),
      schoolClassConflict(constraintFactory),
      teacherAvailability(constraintFactory),
      roomCapacity(constraintFactory),
      teacherQualification(constraintFactory),

      // Soft constraints
      teacherPreferredSlots(constraintFactory),
      minimizeTeacherGaps(constraintFactory),
      subjectDistribution(constraintFactory),
      classTeacherFirstPeriod(constraintFactory)
    };
  }

  // ==================== Hard Constraints ====================

  /** No teacher teaches two lessons at the same timeslot (considering week pattern overlap). */
  Constraint teacherConflict(ConstraintFactory factory) {
    return factory
        .forEachUniquePair(
            PlanningLesson.class,
            Joiners.equal(PlanningLesson::getTimeSlot),
            Joiners.equal(PlanningLesson::getTeacher))
        .filter(PlanningLesson::weekPatternsOverlap)
        .penalize(HardSoftScore.ONE_HARD)
        .asConstraint("Teacher conflict");
  }

  /** No room hosts two lessons at the same timeslot (considering week pattern overlap). */
  Constraint roomConflict(ConstraintFactory factory) {
    return factory
        .forEachUniquePair(
            PlanningLesson.class,
            Joiners.equal(PlanningLesson::getTimeSlot),
            Joiners.equal(PlanningLesson::getRoom))
        .filter((l1, l2) -> l1.getRoom() != null)
        .filter(PlanningLesson::weekPatternsOverlap)
        .penalize(HardSoftScore.ONE_HARD)
        .asConstraint("Room conflict");
  }

  /** No class has two lessons at the same timeslot (considering week pattern overlap). */
  Constraint schoolClassConflict(ConstraintFactory factory) {
    return factory
        .forEachUniquePair(
            PlanningLesson.class,
            Joiners.equal(PlanningLesson::getTimeSlot),
            Joiners.equal(PlanningLesson::getSchoolClass))
        .filter(PlanningLesson::weekPatternsOverlap)
        .penalize(HardSoftScore.ONE_HARD)
        .asConstraint("Class conflict");
  }

  /** Teacher must not be blocked at the assigned timeslot. */
  Constraint teacherAvailability(ConstraintFactory factory) {
    return factory
        .forEach(PlanningLesson.class)
        .filter(lesson -> lesson.getTeacher().isBlockedAt(lesson.getTimeSlot()))
        .penalize(HardSoftScore.ONE_HARD)
        .asConstraint("Teacher availability");
  }

  /** Room must fit the class size. */
  Constraint roomCapacity(ConstraintFactory factory) {
    return factory
        .forEach(PlanningLesson.class)
        .filter(lesson -> lesson.getRoom() != null)
        .filter(lesson -> lesson.getRoom().getCapacity() != null)
        .filter(lesson -> lesson.getSchoolClass().getStudentCount() != null)
        .filter(
            lesson -> lesson.getRoom().getCapacity() < lesson.getSchoolClass().getStudentCount())
        .penalize(HardSoftScore.ONE_HARD)
        .asConstraint("Room capacity");
  }

  /** Teacher must be qualified to teach the subject at the class grade level. */
  Constraint teacherQualification(ConstraintFactory factory) {
    return factory
        .forEach(PlanningLesson.class)
        .filter(
            lesson ->
                !lesson
                    .getTeacher()
                    .isQualifiedFor(
                        lesson.getSubject().getId(), lesson.getSchoolClass().getGradeLevel()))
        .penalize(HardSoftScore.ONE_HARD)
        .asConstraint("Teacher qualification");
  }

  // ==================== Soft Constraints ====================

  /** Reward lessons scheduled in teacher's preferred timeslots. */
  Constraint teacherPreferredSlots(ConstraintFactory factory) {
    return factory
        .forEach(PlanningLesson.class)
        .filter(lesson -> lesson.getTeacher().prefersSlot(lesson.getTimeSlot()))
        .reward(HardSoftScore.ONE_SOFT)
        .asConstraint("Teacher preferred slots");
  }

  /** Penalize gaps between lessons on the same day for a teacher. */
  Constraint minimizeTeacherGaps(ConstraintFactory factory) {
    return factory
        .forEach(PlanningLesson.class)
        .filter(lesson -> lesson.getTimeSlot() != null)
        .join(
            PlanningLesson.class,
            Joiners.equal(PlanningLesson::getTeacher),
            Joiners.equal(lesson -> lesson.getTimeSlot().getDayOfWeek()),
            Joiners.lessThan(lesson -> lesson.getTimeSlot().getPeriod()))
        .filter((l1, l2) -> l2.getTimeSlot() != null)
        .filter(PlanningLesson::weekPatternsOverlap)
        .filter((l1, l2) -> l2.getTimeSlot().getPeriod() - l1.getTimeSlot().getPeriod() > 1)
        .penalize(
            HardSoftScore.ONE_SOFT,
            (l1, l2) -> l2.getTimeSlot().getPeriod() - l1.getTimeSlot().getPeriod() - 1)
        .asConstraint("Teacher gap");
  }

  /** Avoid multiple lessons of the same subject on the same day for a class. */
  Constraint subjectDistribution(ConstraintFactory factory) {
    return factory
        .forEachUniquePair(
            PlanningLesson.class,
            Joiners.equal(PlanningLesson::getSchoolClass),
            Joiners.equal(PlanningLesson::getSubject))
        .filter((l1, l2) -> l1.getTimeSlot() != null && l2.getTimeSlot() != null)
        .filter((l1, l2) -> l1.getTimeSlot().getDayOfWeek() == l2.getTimeSlot().getDayOfWeek())
        .filter(PlanningLesson::weekPatternsOverlap)
        .penalize(HardSoftScore.ofSoft(2))
        .asConstraint("Subject distribution");
  }

  /** Prefer class teacher to teach period 1 for their class. */
  Constraint classTeacherFirstPeriod(ConstraintFactory factory) {
    return factory
        .forEach(PlanningLesson.class)
        .filter(lesson -> lesson.getTimeSlot() != null)
        .filter(lesson -> lesson.getTimeSlot().getPeriod() == 1)
        .filter(lesson -> lesson.getSchoolClass().getClassTeacherId() != null)
        .filter(
            lesson ->
                !lesson.getTeacher().getId().equals(lesson.getSchoolClass().getClassTeacherId()))
        .penalize(HardSoftScore.ONE_SOFT)
        .asConstraint("Class teacher first period");
  }
}
