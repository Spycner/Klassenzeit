package com.klassenzeit.klassenzeit.solver.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.klassenzeit.klassenzeit.common.WeekPattern;
import java.time.LocalTime;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class PlanningDomainTest {

  @Nested
  class PlanningTimeSlotTests {

    @Test
    void getDayPeriodKey_returnsCorrectFormat() {
      PlanningTimeSlot slot =
          new PlanningTimeSlot(
              UUID.randomUUID(),
              (short) 2,
              (short) 3,
              LocalTime.of(10, 0),
              LocalTime.of(10, 45),
              false);

      assertThat(slot.getDayPeriodKey()).isEqualTo("2-3");
    }

    @Test
    void toString_returnsReadableFormat() {
      PlanningTimeSlot slot =
          new PlanningTimeSlot(
              UUID.randomUUID(),
              (short) 0,
              (short) 1,
              LocalTime.of(8, 0),
              LocalTime.of(8, 45),
              false);

      assertThat(slot.toString()).isEqualTo("Mon-P1");
    }

    @Test
    void toString_handlesAllDays() {
      assertThat(createSlotForDay(0).toString()).isEqualTo("Mon-P1");
      assertThat(createSlotForDay(1).toString()).isEqualTo("Tue-P1");
      assertThat(createSlotForDay(2).toString()).isEqualTo("Wed-P1");
      assertThat(createSlotForDay(3).toString()).isEqualTo("Thu-P1");
      assertThat(createSlotForDay(4).toString()).isEqualTo("Fri-P1");
    }

    private PlanningTimeSlot createSlotForDay(int day) {
      return new PlanningTimeSlot(
          UUID.randomUUID(),
          (short) day,
          (short) 1,
          LocalTime.of(8, 0),
          LocalTime.of(8, 45),
          false);
    }
  }

  @Nested
  class PlanningTeacherTests {

    @Test
    void isBlockedAt_returnsTrueForBlockedSlot() {
      PlanningTeacher teacher =
          new PlanningTeacher(
              UUID.randomUUID(),
              "Test Teacher",
              "TT",
              28,
              Set.of("0-1", "0-2"), // Blocked Monday periods 1 and 2
              Set.of(),
              Map.of());

      PlanningTimeSlot slot =
          new PlanningTimeSlot(
              UUID.randomUUID(),
              (short) 0,
              (short) 1,
              LocalTime.of(8, 0),
              LocalTime.of(8, 45),
              false);

      assertThat(teacher.isBlockedAt(slot)).isTrue();
    }

    @Test
    void isBlockedAt_returnsFalseForAvailableSlot() {
      PlanningTeacher teacher =
          new PlanningTeacher(
              UUID.randomUUID(), "Test Teacher", "TT", 28, Set.of("0-1"), Set.of(), Map.of());

      PlanningTimeSlot slot =
          new PlanningTimeSlot(
              UUID.randomUUID(),
              (short) 0,
              (short) 3,
              LocalTime.of(10, 0),
              LocalTime.of(10, 45),
              false);

      assertThat(teacher.isBlockedAt(slot)).isFalse();
    }

    @Test
    void isBlockedAt_returnsFalseForNullSlot() {
      PlanningTeacher teacher =
          new PlanningTeacher(
              UUID.randomUUID(), "Test Teacher", "TT", 28, Set.of("0-1"), Set.of(), Map.of());

      assertThat(teacher.isBlockedAt(null)).isFalse();
    }

    @Test
    void prefersSlot_returnsTrueForPreferredSlot() {
      PlanningTeacher teacher =
          new PlanningTeacher(
              UUID.randomUUID(),
              "Test Teacher",
              "TT",
              28,
              Set.of(),
              Set.of("1-2"), // Prefers Tuesday period 2
              Map.of());

      PlanningTimeSlot slot =
          new PlanningTimeSlot(
              UUID.randomUUID(),
              (short) 1,
              (short) 2,
              LocalTime.of(8, 45),
              LocalTime.of(9, 30),
              false);

      assertThat(teacher.prefersSlot(slot)).isTrue();
    }

    @Test
    void prefersSlot_returnsFalseForNonPreferredSlot() {
      PlanningTeacher teacher =
          new PlanningTeacher(
              UUID.randomUUID(), "Test Teacher", "TT", 28, Set.of(), Set.of("1-2"), Map.of());

      PlanningTimeSlot slot =
          new PlanningTimeSlot(
              UUID.randomUUID(),
              (short) 1,
              (short) 3,
              LocalTime.of(10, 0),
              LocalTime.of(10, 45),
              false);

      assertThat(teacher.prefersSlot(slot)).isFalse();
    }

    @Test
    void isQualifiedFor_returnsTrueWhenQualified() {
      UUID mathId = UUID.randomUUID();
      PlanningTeacher teacher =
          new PlanningTeacher(
              UUID.randomUUID(),
              "Test Teacher",
              "TT",
              28,
              Set.of(),
              Set.of(),
              Map.of(mathId, Set.of(1, 2, 3, 4)));

      assertThat(teacher.isQualifiedFor(mathId, (short) 3)).isTrue();
    }

    @Test
    void isQualifiedFor_returnsFalseWhenNotQualifiedForGrade() {
      UUID mathId = UUID.randomUUID();
      PlanningTeacher teacher =
          new PlanningTeacher(
              UUID.randomUUID(),
              "Test Teacher",
              "TT",
              28,
              Set.of(),
              Set.of(),
              Map.of(mathId, Set.of(1, 2)) // Only grades 1-2
              );

      assertThat(teacher.isQualifiedFor(mathId, (short) 4)).isFalse();
    }

    @Test
    void isQualifiedFor_returnsFalseForUnknownSubject() {
      UUID mathId = UUID.randomUUID();
      UUID germanId = UUID.randomUUID();
      PlanningTeacher teacher =
          new PlanningTeacher(
              UUID.randomUUID(),
              "Test Teacher",
              "TT",
              28,
              Set.of(),
              Set.of(),
              Map.of(mathId, Set.of(1, 2, 3, 4)));

      assertThat(teacher.isQualifiedFor(germanId, (short) 2)).isFalse();
    }
  }

  @Nested
  class PlanningLessonTests {

    @Test
    void weekPatternsOverlap_everyOverlapsWithEvery() {
      PlanningLesson every1 = createLesson(WeekPattern.EVERY);
      PlanningLesson every2 = createLesson(WeekPattern.EVERY);

      assertThat(every1.weekPatternsOverlap(every2)).isTrue();
    }

    @Test
    void weekPatternsOverlap_everyOverlapsWithA() {
      PlanningLesson every = createLesson(WeekPattern.EVERY);
      PlanningLesson weekA = createLesson(WeekPattern.A);

      assertThat(every.weekPatternsOverlap(weekA)).isTrue();
      assertThat(weekA.weekPatternsOverlap(every)).isTrue();
    }

    @Test
    void weekPatternsOverlap_everyOverlapsWithB() {
      PlanningLesson every = createLesson(WeekPattern.EVERY);
      PlanningLesson weekB = createLesson(WeekPattern.B);

      assertThat(every.weekPatternsOverlap(weekB)).isTrue();
      assertThat(weekB.weekPatternsOverlap(every)).isTrue();
    }

    @Test
    void weekPatternsOverlap_aOverlapsWithA() {
      PlanningLesson weekA1 = createLesson(WeekPattern.A);
      PlanningLesson weekA2 = createLesson(WeekPattern.A);

      assertThat(weekA1.weekPatternsOverlap(weekA2)).isTrue();
    }

    @Test
    void weekPatternsOverlap_bOverlapsWithB() {
      PlanningLesson weekB1 = createLesson(WeekPattern.B);
      PlanningLesson weekB2 = createLesson(WeekPattern.B);

      assertThat(weekB1.weekPatternsOverlap(weekB2)).isTrue();
    }

    @Test
    void weekPatternsOverlap_aDoesNotOverlapWithB() {
      PlanningLesson weekA = createLesson(WeekPattern.A);
      PlanningLesson weekB = createLesson(WeekPattern.B);

      assertThat(weekA.weekPatternsOverlap(weekB)).isFalse();
      assertThat(weekB.weekPatternsOverlap(weekA)).isFalse();
    }

    private PlanningLesson createLesson(WeekPattern pattern) {
      return new PlanningLesson(
          UUID.randomUUID(),
          new PlanningSchoolClass(UUID.randomUUID(), "1a", (short) 1, 25, null),
          new PlanningTeacher(UUID.randomUUID(), "Teacher", "T", 28, Set.of(), Set.of(), Map.of()),
          new PlanningSubject(UUID.randomUUID(), "Math", "MA"),
          pattern);
    }
  }

  @Nested
  class PlanningRoomTests {

    @Test
    void hasFeatures_returnsTrueWhenAllFeaturesPresent() {
      PlanningRoom room =
          new PlanningRoom(
              UUID.randomUUID(), "Lab", 30, Set.of("computer", "projector", "whiteboard"));

      assertThat(room.hasFeatures(Set.of("computer", "projector"))).isTrue();
    }

    @Test
    void hasFeatures_returnsFalseWhenFeatureMissing() {
      PlanningRoom room = new PlanningRoom(UUID.randomUUID(), "Room 101", 30, Set.of("whiteboard"));

      assertThat(room.hasFeatures(Set.of("computer"))).isFalse();
    }

    @Test
    void hasFeatures_returnsTrueForEmptyRequirements() {
      PlanningRoom room = new PlanningRoom(UUID.randomUUID(), "Room 101", 30, Set.of());

      assertThat(room.hasFeatures(Set.of())).isTrue();
      assertThat(room.hasFeatures(null)).isTrue();
    }

    @Test
    void hasFeatures_returnsTrueWhenRoomHasExtraFeatures() {
      PlanningRoom room =
          new PlanningRoom(
              UUID.randomUUID(), "Lab", 30, Set.of("computer", "projector", "whiteboard"));

      assertThat(room.hasFeatures(Set.of("projector"))).isTrue();
    }
  }

  @Nested
  class EqualityTests {

    @Test
    void planningSubject_equalityBasedOnId() {
      UUID id = UUID.randomUUID();
      PlanningSubject subject1 = new PlanningSubject(id, "Math", "MA");
      PlanningSubject subject2 = new PlanningSubject(id, "Mathematics", "MATH");

      assertThat(subject1).isEqualTo(subject2);
      assertThat(subject1.hashCode()).isEqualTo(subject2.hashCode());
    }

    @Test
    void planningTimeSlot_equalityBasedOnId() {
      UUID id = UUID.randomUUID();
      PlanningTimeSlot slot1 =
          new PlanningTimeSlot(
              id, (short) 0, (short) 1, LocalTime.of(8, 0), LocalTime.of(8, 45), false);
      PlanningTimeSlot slot2 =
          new PlanningTimeSlot(
              id, (short) 1, (short) 2, LocalTime.of(9, 0), LocalTime.of(9, 45), true);

      assertThat(slot1).isEqualTo(slot2);
      assertThat(slot1.hashCode()).isEqualTo(slot2.hashCode());
    }

    @Test
    void planningRoom_equalityBasedOnId() {
      UUID id = UUID.randomUUID();
      PlanningRoom room1 = new PlanningRoom(id, "Room A", 30, Set.of());
      PlanningRoom room2 = new PlanningRoom(id, "Room B", 40, Set.of("projector"));

      assertThat(room1).isEqualTo(room2);
      assertThat(room1.hashCode()).isEqualTo(room2.hashCode());
    }

    @Test
    void planningSchoolClass_equalityBasedOnId() {
      UUID id = UUID.randomUUID();
      PlanningSchoolClass class1 = new PlanningSchoolClass(id, "1a", (short) 1, 20, null);
      PlanningSchoolClass class2 =
          new PlanningSchoolClass(id, "1b", (short) 2, 30, UUID.randomUUID());

      assertThat(class1).isEqualTo(class2);
      assertThat(class1.hashCode()).isEqualTo(class2.hashCode());
    }

    @Test
    void planningTeacher_equalityBasedOnId() {
      UUID id = UUID.randomUUID();
      PlanningTeacher teacher1 =
          new PlanningTeacher(id, "John Doe", "JD", 28, Set.of(), Set.of(), Map.of());
      PlanningTeacher teacher2 =
          new PlanningTeacher(id, "Jane Doe", "JA", 20, Set.of("0-1"), Set.of("1-2"), Map.of());

      assertThat(teacher1).isEqualTo(teacher2);
      assertThat(teacher1.hashCode()).isEqualTo(teacher2.hashCode());
    }

    @Test
    void planningLesson_equalityBasedOnId() {
      UUID id = UUID.randomUUID();
      PlanningLesson lesson1 =
          new PlanningLesson(
              id,
              new PlanningSchoolClass(UUID.randomUUID(), "1a", (short) 1, 25, null),
              new PlanningTeacher(
                  UUID.randomUUID(), "Teacher", "T", 28, Set.of(), Set.of(), Map.of()),
              new PlanningSubject(UUID.randomUUID(), "Math", "MA"),
              WeekPattern.EVERY);
      PlanningLesson lesson2 =
          new PlanningLesson(
              id,
              new PlanningSchoolClass(UUID.randomUUID(), "2b", (short) 2, 30, null),
              new PlanningTeacher(
                  UUID.randomUUID(), "Other", "O", 20, Set.of(), Set.of(), Map.of()),
              new PlanningSubject(UUID.randomUUID(), "German", "DE"),
              WeekPattern.A);

      assertThat(lesson1).isEqualTo(lesson2);
      assertThat(lesson1.hashCode()).isEqualTo(lesson2.hashCode());
    }
  }
}
