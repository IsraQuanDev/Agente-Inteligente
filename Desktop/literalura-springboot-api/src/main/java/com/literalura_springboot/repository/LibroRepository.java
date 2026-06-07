package com.literalura_springboot.repository;

import com.literalura_springboot.model.Libro;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface LibroRepository extends JpaRepository<Libro, Long> {
    List<Libro> findByIdioma(String idioma);
    List<Libro> findTop10ByOrderByDescargasDesc();
}
