package com.mx.apiRestCinepolis.service;

import java.sql.Date;
import java.util.List;
 
import com.mx.apiRestCinepolis.model.Peliculas;


public interface PeliculasServ {

	
	public void guardar(Peliculas pelicula);
	public List<Peliculas> listar();
	public Peliculas buscarId(int idPelicula);
	public void editar(Peliculas pelicula);
	public void eliminarXid(int idPelicula);
	
	
	public List<Peliculas> buscarXnombre(String pelicula);
	public List<Peliculas> buscarXgenero(String genero);
	
	
}
