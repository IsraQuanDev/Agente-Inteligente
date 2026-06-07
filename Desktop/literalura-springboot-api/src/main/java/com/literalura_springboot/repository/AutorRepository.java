package com.literalura_springboot.repository;


import com.literalura_springboot.model.Autor;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface AutorRepository extends JpaRepository<Autor, Long> {
    Optional<Autor> findByNombre(String nombre);

    // autores que nacieron <= year y (fallecimiento == null OR fallecimiento > year)
    List<Autor> findByNacimientoLessThanEqualAndFallecimientoGreaterThan(Integer birthYear, Integer deathYear);

    // Variante para manejar nulos: usar @Query si es necesario
}
