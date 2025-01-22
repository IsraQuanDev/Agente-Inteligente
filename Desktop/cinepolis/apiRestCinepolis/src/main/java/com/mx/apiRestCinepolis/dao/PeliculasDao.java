package com.mx.apiRestCinepolis.dao;

import org.springframework.data.repository.CrudRepository;
import org.springframework.stereotype.Repository;

import com.mx.apiRestCinepolis.model.Peliculas;


@Repository
public interface PeliculasDao extends CrudRepository<Peliculas,Integer> {

	
	
}
