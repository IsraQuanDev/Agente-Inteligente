package com.mx.apiRestCinepolis.service;

import java.sql.Date;
import java.util.ArrayList;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
 
import com.mx.apiRestCinepolis.dao.PeliculasDao;
import com.mx.apiRestCinepolis.model.Peliculas;

@Service
public class PeliculasServImp implements PeliculasServ {
	
	@Autowired
	PeliculasDao dao;

	@Transactional 
	// Se agrega cuando no vamos a realizar cambios a la base de datos
	@Override
	public void guardar(Peliculas pelicula) {
		
		dao.save(pelicula);
	}
	
	@Transactional(readOnly= true) 
	@Override
	public List<Peliculas> listar(){
		
		//return  (List<Peliculas>) dao.findAll();  
		// es el cambio de un tipo de valor a otro, polimorfismo puro	 
		    List<Peliculas> peliculas = (List<Peliculas>) dao.findAll();
		    System.out.println(peliculas); // Agrega esto para ver los datos en la consola
		    return peliculas;
	
	}
	 
	
	 
	@Override
	@Transactional(readOnly = true)
	public Peliculas buscarId(int idPelicula) {
	    return dao.findById(idPelicula).orElse(null);
	}


	@Override
	@Transactional
	public void editar(Peliculas pelicula) {
	    dao.save(pelicula);
	}


	@Override
	@Transactional
	public void eliminarXid(int idPelicula) {
	    dao.deleteById(idPelicula);
	}
	
	

	@Transactional(readOnly=true)
	@Override
	public List<Peliculas> buscarXnombre(String pelicula) {
		// TODO Auto-generated method stub

		List<Peliculas> lista=  dao.findByNombre(pelicula);
		return lista;
	}
	
	

	
	  @Override
	    public List<Peliculas> buscarXgenero(String genero) {
		  
	        List<Peliculas> generosEncontrados = new ArrayList<>();
	        
	        // Iterar a través de todos los empleados
	        for (Peliculas pelicula: listar()) {
	            // Comparar fecha de nacimiento
	            if (pelicula.getGenero().equals(genero)) {
	                generosEncontrados.add(pelicula); 
	                // Añadir a la lista de resultados
	            }
	        }

	        return generosEncontrados;
	    }
	
	
	


}
