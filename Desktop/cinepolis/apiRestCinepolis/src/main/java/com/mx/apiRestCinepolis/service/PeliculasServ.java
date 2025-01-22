package com.mx.apiRestCinepolis.service;

import java.util.List;

import com.mx.apiRestCinepolis.model.Peliculas;


public interface PeliculasServ {

	
	public void guardar(Peliculas pelicula);
	public List<Peliculas> listar();
	public Peliculas buscarId(int idPelicula);
	public void editar(Peliculas pelicula);
	public void eliminarXid(int idPelicula);
	
}
