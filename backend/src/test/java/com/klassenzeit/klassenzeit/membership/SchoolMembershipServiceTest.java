package com.klassenzeit.klassenzeit.membership;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.klassenzeit.klassenzeit.AbstractIntegrationTest;
import com.klassenzeit.klassenzeit.TestDataBuilder;
import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.membership.dto.CreateMembershipRequest;
import com.klassenzeit.klassenzeit.membership.dto.MembershipResponse;
import com.klassenzeit.klassenzeit.membership.dto.MembershipSummary;
import com.klassenzeit.klassenzeit.membership.dto.UpdateMembershipRequest;
import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.teacher.Teacher;
import com.klassenzeit.klassenzeit.user.AppUser;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

@Transactional
class SchoolMembershipServiceTest extends AbstractIntegrationTest {

  @Autowired private SchoolMembershipService membershipService;
  @Autowired private EntityManager entityManager;

  private TestDataBuilder testData;
  private School school;
  private AppUser adminUser;

  @BeforeEach
  void setUp() {
    testData = new TestDataBuilder(entityManager);
    school = testData.school().persist();
    adminUser = testData.appUser().withEmail("admin@example.com").persist();
  }

  @Nested
  class FindAllBySchool {

    @Test
    void returnsAllActiveMembers() {
      AppUser user1 = testData.appUser().withEmail("user1@example.com").persist();
      AppUser user2 = testData.appUser().withEmail("user2@example.com").persist();
      testData.membership(school, user1).withRole(SchoolRole.SCHOOL_ADMIN).persist();
      testData.membership(school, user2).withRole(SchoolRole.PLANNER).persist();
      entityManager.flush();
      entityManager.clear();

      List<MembershipSummary> result = membershipService.findAllBySchool(school.getId());

      assertThat(result).hasSize(2);
      assertThat(result)
          .extracting(MembershipSummary::role)
          .containsExactlyInAnyOrder(SchoolRole.SCHOOL_ADMIN, SchoolRole.PLANNER);
    }

    @Test
    void doesNotReturnInactiveMembers() {
      AppUser activeUser = testData.appUser().withEmail("active@example.com").persist();
      AppUser inactiveUser = testData.appUser().withEmail("inactive@example.com").persist();
      testData.membership(school, activeUser).withRole(SchoolRole.PLANNER).isActive(true).persist();
      testData
          .membership(school, inactiveUser)
          .withRole(SchoolRole.VIEWER)
          .isActive(false)
          .persist();
      entityManager.flush();
      entityManager.clear();

      List<MembershipSummary> result = membershipService.findAllBySchool(school.getId());

      assertThat(result).hasSize(1);
      assertThat(result.get(0).userEmail()).isEqualTo("active@example.com");
    }

    @Test
    void doesNotReturnMembersFromOtherSchool() {
      AppUser user1 = testData.appUser().withEmail("user1@example.com").persist();
      AppUser user2 = testData.appUser().withEmail("user2@example.com").persist();
      testData.membership(school, user1).withRole(SchoolRole.PLANNER).persist();

      School otherSchool = testData.school().withSlug("other-school").persist();
      testData.membership(otherSchool, user2).withRole(SchoolRole.SCHOOL_ADMIN).persist();
      entityManager.flush();
      entityManager.clear();

      List<MembershipSummary> result = membershipService.findAllBySchool(school.getId());

      assertThat(result).hasSize(1);
      assertThat(result.get(0).userEmail()).isEqualTo("user1@example.com");
    }

    @Test
    void returnsEmptyListWhenNoMembers() {
      entityManager.flush();
      entityManager.clear();

      List<MembershipSummary> result = membershipService.findAllBySchool(school.getId());

      assertThat(result).isEmpty();
    }
  }

  @Nested
  class FindById {

    @Test
    void returnsMembershipWhenFound() {
      AppUser user =
          testData.appUser().withEmail("user@example.com").withDisplayName("Test User").persist();
      SchoolMembership membership =
          testData
              .membership(school, user)
              .withRole(SchoolRole.PLANNER)
              .grantedBy(adminUser)
              .persist();
      entityManager.flush();
      entityManager.clear();

      MembershipResponse result = membershipService.findById(school.getId(), membership.getId());

      assertThat(result.id()).isEqualTo(membership.getId());
      assertThat(result.userId()).isEqualTo(user.getId());
      assertThat(result.userDisplayName()).isEqualTo("Test User");
      assertThat(result.userEmail()).isEqualTo("user@example.com");
      assertThat(result.schoolId()).isEqualTo(school.getId());
      assertThat(result.role()).isEqualTo(SchoolRole.PLANNER);
      assertThat(result.isActive()).isTrue();
      assertThat(result.grantedById()).isEqualTo(adminUser.getId());
      assertThat(result.grantedAt()).isNotNull();
      assertThat(result.createdAt()).isNotNull();
      assertThat(result.updatedAt()).isNotNull();
    }

    @Test
    void throwsWhenMembershipNotFound() {
      UUID nonExistentId = UUID.randomUUID();

      assertThatThrownBy(() -> membershipService.findById(school.getId(), nonExistentId))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("Membership")
          .hasMessageContaining(nonExistentId.toString());
    }

    @Test
    void throwsWhenMembershipBelongsToDifferentSchool() {
      AppUser user = testData.appUser().withEmail("user@example.com").persist();
      School otherSchool = testData.school().withSlug("other-school").persist();
      SchoolMembership membership =
          testData.membership(otherSchool, user).withRole(SchoolRole.VIEWER).persist();
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(() -> membershipService.findById(school.getId(), membership.getId()))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class Create {

    @Test
    void createsMembershipSuccessfully() {
      AppUser newUser = testData.appUser().withEmail("newuser@example.com").persist();
      entityManager.flush();
      entityManager.clear();

      CreateMembershipRequest request =
          new CreateMembershipRequest(newUser.getId(), SchoolRole.PLANNER, null);

      MembershipResponse result =
          membershipService.create(school.getId(), request, adminUser.getId());

      assertThat(result.id()).isNotNull();
      assertThat(result.userId()).isEqualTo(newUser.getId());
      assertThat(result.role()).isEqualTo(SchoolRole.PLANNER);
      assertThat(result.isActive()).isTrue();
      assertThat(result.grantedById()).isEqualTo(adminUser.getId());
      assertThat(result.grantedAt()).isNotNull();
    }

    @Test
    void createsMembershipWithLinkedTeacher() {
      AppUser newUser = testData.appUser().withEmail("newuser@example.com").persist();
      Teacher teacher =
          testData.teacher(school).withFirstName("Max").withLastName("Mustermann").persist();
      entityManager.flush();
      entityManager.clear();

      CreateMembershipRequest request =
          new CreateMembershipRequest(newUser.getId(), SchoolRole.TEACHER, teacher.getId());

      MembershipResponse result =
          membershipService.create(school.getId(), request, adminUser.getId());

      assertThat(result.linkedTeacherId()).isEqualTo(teacher.getId());
      assertThat(result.linkedTeacherName()).isEqualTo("Max Mustermann");
    }

    @Test
    void throwsWhenUserAlreadyHasMembership() {
      AppUser existingUser = testData.appUser().withEmail("existing@example.com").persist();
      testData.membership(school, existingUser).withRole(SchoolRole.VIEWER).persist();
      entityManager.flush();
      entityManager.clear();

      CreateMembershipRequest request =
          new CreateMembershipRequest(existingUser.getId(), SchoolRole.PLANNER, null);

      assertThatThrownBy(() -> membershipService.create(school.getId(), request, adminUser.getId()))
          .isInstanceOf(ForbiddenOperationException.class)
          .hasMessageContaining("already has an active membership");
    }

    @Test
    void throwsWhenUserNotFound() {
      UUID nonExistentUserId = UUID.randomUUID();
      CreateMembershipRequest request =
          new CreateMembershipRequest(nonExistentUserId, SchoolRole.PLANNER, null);

      assertThatThrownBy(() -> membershipService.create(school.getId(), request, adminUser.getId()))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("User");
    }

    @Test
    void throwsWhenSchoolNotFound() {
      AppUser newUser = testData.appUser().withEmail("newuser@example.com").persist();
      entityManager.flush();
      entityManager.clear();

      UUID nonExistentSchoolId = UUID.randomUUID();
      CreateMembershipRequest request =
          new CreateMembershipRequest(newUser.getId(), SchoolRole.PLANNER, null);

      assertThatThrownBy(
              () -> membershipService.create(nonExistentSchoolId, request, adminUser.getId()))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("School");
    }

    @Test
    void throwsWhenLinkedTeacherNotFound() {
      AppUser newUser = testData.appUser().withEmail("newuser@example.com").persist();
      entityManager.flush();
      entityManager.clear();

      UUID nonExistentTeacherId = UUID.randomUUID();
      CreateMembershipRequest request =
          new CreateMembershipRequest(newUser.getId(), SchoolRole.TEACHER, nonExistentTeacherId);

      assertThatThrownBy(() -> membershipService.create(school.getId(), request, adminUser.getId()))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("Teacher");
    }

    @Test
    void throwsWhenLinkedTeacherBelongsToDifferentSchool() {
      AppUser newUser = testData.appUser().withEmail("newuser@example.com").persist();
      School otherSchool = testData.school().withSlug("other-school").persist();
      Teacher teacherInOtherSchool = testData.teacher(otherSchool).persist();
      entityManager.flush();
      entityManager.clear();

      CreateMembershipRequest request =
          new CreateMembershipRequest(
              newUser.getId(), SchoolRole.TEACHER, teacherInOtherSchool.getId());

      assertThatThrownBy(() -> membershipService.create(school.getId(), request, adminUser.getId()))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("Teacher");
    }
  }

  @Nested
  class Update {

    @Test
    void updatesRoleSuccessfully() {
      AppUser user = testData.appUser().withEmail("user@example.com").persist();
      // Create two admins so we can demote one
      testData.membership(school, adminUser).withRole(SchoolRole.SCHOOL_ADMIN).persist();
      SchoolMembership membership =
          testData.membership(school, user).withRole(SchoolRole.SCHOOL_ADMIN).persist();
      entityManager.flush();
      entityManager.clear();

      UpdateMembershipRequest request = new UpdateMembershipRequest(SchoolRole.PLANNER, null);

      MembershipResponse result =
          membershipService.update(school.getId(), membership.getId(), request);

      assertThat(result.role()).isEqualTo(SchoolRole.PLANNER);
    }

    @Test
    void updatesLinkedTeacher() {
      AppUser user = testData.appUser().withEmail("user@example.com").persist();
      Teacher teacher =
          testData.teacher(school).withFirstName("Max").withLastName("Mustermann").persist();
      SchoolMembership membership =
          testData.membership(school, user).withRole(SchoolRole.TEACHER).persist();
      entityManager.flush();
      entityManager.clear();

      UpdateMembershipRequest request =
          new UpdateMembershipRequest(SchoolRole.TEACHER, teacher.getId());

      MembershipResponse result =
          membershipService.update(school.getId(), membership.getId(), request);

      assertThat(result.linkedTeacherId()).isEqualTo(teacher.getId());
      assertThat(result.linkedTeacherName()).isEqualTo("Max Mustermann");
    }

    @Test
    void removesLinkedTeacherWhenNull() {
      AppUser user = testData.appUser().withEmail("user@example.com").persist();
      Teacher teacher = testData.teacher(school).persist();
      SchoolMembership membership =
          testData
              .membership(school, user)
              .withRole(SchoolRole.TEACHER)
              .linkedTo(teacher)
              .persist();
      entityManager.flush();
      entityManager.clear();

      UpdateMembershipRequest request = new UpdateMembershipRequest(SchoolRole.TEACHER, null);

      MembershipResponse result =
          membershipService.update(school.getId(), membership.getId(), request);

      assertThat(result.linkedTeacherId()).isNull();
      assertThat(result.linkedTeacherName()).isNull();
    }

    @Test
    void throwsWhenDemotingLastAdmin() {
      AppUser user = testData.appUser().withEmail("user@example.com").persist();
      SchoolMembership membership =
          testData.membership(school, user).withRole(SchoolRole.SCHOOL_ADMIN).persist();
      entityManager.flush();
      entityManager.clear();

      UpdateMembershipRequest request = new UpdateMembershipRequest(SchoolRole.PLANNER, null);

      assertThatThrownBy(
              () -> membershipService.update(school.getId(), membership.getId(), request))
          .isInstanceOf(ForbiddenOperationException.class)
          .hasMessageContaining("last school administrator");
    }

    @Test
    void throwsWhenMembershipNotFound() {
      UUID nonExistentId = UUID.randomUUID();
      UpdateMembershipRequest request = new UpdateMembershipRequest(SchoolRole.PLANNER, null);

      assertThatThrownBy(() -> membershipService.update(school.getId(), nonExistentId, request))
          .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void throwsWhenMembershipBelongsToDifferentSchool() {
      AppUser user = testData.appUser().withEmail("user@example.com").persist();
      School otherSchool = testData.school().withSlug("other-school").persist();
      SchoolMembership membership =
          testData.membership(otherSchool, user).withRole(SchoolRole.VIEWER).persist();
      entityManager.flush();
      entityManager.clear();

      UpdateMembershipRequest request = new UpdateMembershipRequest(SchoolRole.PLANNER, null);

      assertThatThrownBy(
              () -> membershipService.update(school.getId(), membership.getId(), request))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class Delete {

    @Test
    void softDeletesMembership() {
      AppUser user = testData.appUser().withEmail("user@example.com").persist();
      SchoolMembership membership =
          testData.membership(school, user).withRole(SchoolRole.VIEWER).persist();
      entityManager.flush();
      entityManager.clear();

      membershipService.delete(school.getId(), membership.getId(), adminUser.getId());

      entityManager.flush();
      entityManager.clear();

      MembershipResponse result = membershipService.findById(school.getId(), membership.getId());
      assertThat(result.isActive()).isFalse();
    }

    @Test
    void allowsSelfRemovalWhenNotLastAdmin() {
      // Create two admins
      testData.membership(school, adminUser).withRole(SchoolRole.SCHOOL_ADMIN).persist();
      AppUser anotherAdmin = testData.appUser().withEmail("another-admin@example.com").persist();
      SchoolMembership anotherAdminMembership =
          testData.membership(school, anotherAdmin).withRole(SchoolRole.SCHOOL_ADMIN).persist();
      entityManager.flush();
      entityManager.clear();

      // Another admin removes themselves
      membershipService.delete(
          school.getId(), anotherAdminMembership.getId(), anotherAdmin.getId());

      entityManager.flush();
      entityManager.clear();

      MembershipResponse result =
          membershipService.findById(school.getId(), anotherAdminMembership.getId());
      assertThat(result.isActive()).isFalse();
    }

    @Test
    void throwsWhenRemovingLastAdmin() {
      AppUser user = testData.appUser().withEmail("user@example.com").persist();
      SchoolMembership membership =
          testData.membership(school, user).withRole(SchoolRole.SCHOOL_ADMIN).persist();
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(
              () -> membershipService.delete(school.getId(), membership.getId(), adminUser.getId()))
          .isInstanceOf(ForbiddenOperationException.class)
          .hasMessageContaining("last school administrator");
    }

    @Test
    void throwsWhenMembershipNotFound() {
      UUID nonExistentId = UUID.randomUUID();

      assertThatThrownBy(
              () -> membershipService.delete(school.getId(), nonExistentId, adminUser.getId()))
          .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void throwsWhenMembershipBelongsToDifferentSchool() {
      AppUser user = testData.appUser().withEmail("user@example.com").persist();
      School otherSchool = testData.school().withSlug("other-school").persist();
      SchoolMembership membership =
          testData.membership(otherSchool, user).withRole(SchoolRole.VIEWER).persist();
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(
              () -> membershipService.delete(school.getId(), membership.getId(), adminUser.getId()))
          .isInstanceOf(EntityNotFoundException.class);
    }
  }

  @Nested
  class AssignSchoolAdmin {

    @Test
    void assignsUserAsSchoolAdmin() {
      AppUser newUser = testData.appUser().withEmail("newadmin@example.com").persist();
      entityManager.flush();
      entityManager.clear();

      MembershipResponse result =
          membershipService.assignSchoolAdmin(school.getId(), newUser.getId(), adminUser.getId());

      assertThat(result.id()).isNotNull();
      assertThat(result.userId()).isEqualTo(newUser.getId());
      assertThat(result.role()).isEqualTo(SchoolRole.SCHOOL_ADMIN);
      assertThat(result.isActive()).isTrue();
      assertThat(result.grantedById()).isEqualTo(adminUser.getId());
      assertThat(result.grantedAt()).isNotNull();
    }

    @Test
    void throwsWhenSchoolNotFound() {
      AppUser newUser = testData.appUser().withEmail("newadmin@example.com").persist();
      entityManager.flush();
      entityManager.clear();

      UUID nonExistentSchoolId = UUID.randomUUID();

      assertThatThrownBy(
              () ->
                  membershipService.assignSchoolAdmin(
                      nonExistentSchoolId, newUser.getId(), adminUser.getId()))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("School");
    }

    @Test
    void throwsWhenUserNotFound() {
      entityManager.flush();
      entityManager.clear();

      UUID nonExistentUserId = UUID.randomUUID();

      assertThatThrownBy(
              () ->
                  membershipService.assignSchoolAdmin(
                      school.getId(), nonExistentUserId, adminUser.getId()))
          .isInstanceOf(EntityNotFoundException.class)
          .hasMessageContaining("User");
    }

    @Test
    void throwsWhenUserAlreadyHasMembership() {
      AppUser existingUser = testData.appUser().withEmail("existing@example.com").persist();
      testData.membership(school, existingUser).withRole(SchoolRole.VIEWER).persist();
      entityManager.flush();
      entityManager.clear();

      assertThatThrownBy(
              () ->
                  membershipService.assignSchoolAdmin(
                      school.getId(), existingUser.getId(), adminUser.getId()))
          .isInstanceOf(ForbiddenOperationException.class)
          .hasMessageContaining("already has an active membership");
    }
  }
}
