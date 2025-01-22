package com.mx.apiRestCinepolis.dao;

import java.util.List;

import org.springframework.data.repository.CrudRepository;
import org.springframework.stereotype.Repository;
 
import com.mx.apiRestCinepolis.model.Peliculas;


@Repository
public interface PeliculasDao extends CrudRepository<Peliculas,Integer> {

	// CREAR UN METODO UTILIZANDO EL RESORTE DE LOS REPOSITORIOS: finBy
	
	public List<Peliculas> findByNombre(String nombre);
	
}
