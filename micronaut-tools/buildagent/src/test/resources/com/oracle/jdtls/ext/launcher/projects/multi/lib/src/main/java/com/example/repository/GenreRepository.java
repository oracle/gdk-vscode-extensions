// Copyright (c) 2023, Oracle.
// Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
package com.example.repository;

import com.example.domain.Genre;
import io.micronaut.core.annotation.NonNull;
import io.micronaut.data.annotation.Id;
import io.micronaut.data.jdbc.annotation.JdbcRepository;
import io.micronaut.data.repository.PageableRepository;

import javax.validation.constraints.NotBlank;

import static io.micronaut.data.model.query.builder.sql.Dialect.MYSQL;

@JdbcRepository(dialect = MYSQL)
public interface GenreRepository extends PageableRepository<Genre, Long> {

    Genre save(@NonNull @NotBlank String name);

    long update(@Id long id, @NonNull @NotBlank String name);
}
