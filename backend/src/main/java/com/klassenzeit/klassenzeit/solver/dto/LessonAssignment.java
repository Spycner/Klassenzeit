package com.klassenzeit.klassenzeit.solver.dto;

import com.klassenzeit.klassenzeit.common.WeekPattern;
import java.util.UUID;

/**
 * A single lesson assignment from the solver solution.
 *
 * @param lessonId the lesson ID
 * @param schoolClassId the school class ID
 * @param schoolClassName the school class name (e.g., "1a")
 * @param teacherId the teacher ID
 * @param teacherName the teacher's full name
 * @param subjectId the subject ID
 * @param subjectName the subject name
 * @param timeSlotId the assigned time slot ID (null if unassigned)
 * @param dayOfWeek the day of week (0-4 for Mon-Fri, null if unassigned)
 * @param period the period number (1-based, null if unassigned)
 * @param roomId the assigned room ID (null if unassigned)
 * @param roomName the room name (null if unassigned)
 * @param weekPattern the week pattern (EVERY, A, or B)
 */
public record LessonAssignment(
    UUID lessonId,
    UUID schoolClassId,
    String schoolClassName,
    UUID teacherId,
    String teacherName,
    UUID subjectId,
    String subjectName,
    UUID timeSlotId,
    Short dayOfWeek,
    Short period,
    UUID roomId,
    String roomName,
    WeekPattern weekPattern) {}
