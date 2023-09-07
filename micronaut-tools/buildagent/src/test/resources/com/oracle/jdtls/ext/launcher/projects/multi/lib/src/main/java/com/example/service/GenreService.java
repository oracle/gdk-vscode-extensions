// Copyright (c) 2023, Oracle.
// Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
package com.example.service;

import com.example.domain.Genre;
import com.example.repository.GenreRepository;
import io.micronaut.data.model.Pageable;
import jakarta.inject.Singleton;

import javax.transaction.Transactional;
import java.util.List;
import java.util.Optional;

@Singleton
public class GenreService {

    private final GenreRepository genreRepository;

    GenreService(GenreRepository genreRepository) {
        this.genreRepository = genreRepository;
    }

    public Optional<Genre> findById(Long id) {
        return genreRepository.findById(id);
    }

    @Transactional
    public long update(long id, String name) {
        return genreRepository.update(id, name);
    }

    public List<Genre> list(Pageable pageable) {
        return genreRepository.findAll(pageable).getContent();
    }

    @Transactional
    public Genre save(String name) {
        return genreRepository.save(name);
    }

    @Transactional
    public void delete(long id) {
        genreRepository.deleteById(id);
    }
}
