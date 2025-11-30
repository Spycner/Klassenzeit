package com.klassenzeit.klassenzeit.school;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TermRepository extends JpaRepository<Term, UUID> {

  List<Term> findBySchoolYearId(UUID schoolYearId);

  Optional<Term> findBySchoolYearIdAndIsCurrentTrue(UUID schoolYearId);

  List<Term> findBySchoolYearIdOrderByStartDateAsc(UUID schoolYearId);

  Optional<Term> findBySchoolYearIdAndName(UUID schoolYearId, String name);

  boolean existsBySchoolYearIdAndName(UUID schoolYearId, String name);
}
