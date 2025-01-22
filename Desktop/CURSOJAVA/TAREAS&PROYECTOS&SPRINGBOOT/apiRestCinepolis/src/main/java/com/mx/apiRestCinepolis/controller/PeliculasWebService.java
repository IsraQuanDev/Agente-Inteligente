package com.mx.apiRestCinepolis.controller;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
 
import com.mx.apiRestCinepolis.model.Peliculas; 
import com.mx.apiRestCinepolis.service.PeliculasServImp; 
 

@RestController
@RequestMapping(path="PeliculasWebService")
@CrossOrigin 
public class PeliculasWebService {
	
				
			@Autowired 
			PeliculasServImp peliculaImp; 
			
			// http://localhost:9000/PeliculasWebService/listar
			
			@GetMapping("listar")
			public List<Peliculas> listar(){
				
				return peliculaImp.listar();
				
			}
		  

			//@RequestBody convierte un json a un objeto 
			// http://localhost:9000/PeliculasWebService/guardar
			
			@PostMapping(path="guardar")
			public void guardar(@RequestBody Peliculas pelicula) {
				peliculaImp.guardar(pelicula);
			}
			
			// http://localhost:9000/PeliculasWebService/buscarId
			@PostMapping(path="buscarId")
			public Peliculas buscar(@RequestBody Peliculas pelicula)
			{
				return peliculaImp.buscarId(pelicula.getIdPelicula());			
			}
			
			// http://localhost:9000/PeliculasWebService/editar
			@PostMapping(path="editar")
			public void editar(@RequestBody Peliculas pelicula)
			{
						peliculaImp.editar(pelicula);			
			}
			
			// http://localhost:9000/PeliculasWebService/eliminar
			@PostMapping(path="eliminar")
			public void eliminar(@RequestBody Peliculas pelicula)
			{
						peliculaImp.eliminarXid(pelicula.getIdPelicula()); 			
			}
						

			// http://localhost:9000/PeliculasWebService/buscarXNombre
			@PostMapping(path="buscarXNombre")
			public List<Peliculas> buscarXnombre(@RequestBody Peliculas pelicula)
			{
				return peliculaImp.buscarXnombre(pelicula.getNombre());			
			}
			
			
			// http://localhost:9000/PeliculasWebService/buscarXgenero
			@PostMapping(path="buscarXgenero")
			public List<Peliculas> buscarXFechaNac(@RequestBody Peliculas genero)
			{
				return peliculaImp.buscarXgenero(genero.getGenero());			
			}
		
			
}
