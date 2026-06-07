package com.literalura_springboot.service;

import com.literalura_springboot.client.GutendexClient;
import com.literalura_springboot.dto.BookApiResponse;
import com.literalura_springboot.model.Autor;
import com.literalura_springboot.model.Libro;
import com.literalura_springboot.repository.AutorRepository;
import com.literalura_springboot.repository.LibroRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class GutendexService {
    private final GutendexClient client;
    private final AutorRepository autorRepo;
    private final LibroRepository libroRepo;

    public GutendexService(GutendexClient client, AutorRepository autorRepo, LibroRepository libroRepo) {
        this.client = client;
        this.autorRepo = autorRepo;
        this.libroRepo = libroRepo;
    }

    @Transactional
    public Libro buscarYGuardarPrimerResultado(String titulo) {
        BookApiResponse resp = client.buscarPorTitulo(titulo);
        if (resp.getResults() == null || resp.getResults().isEmpty()) {
            throw new RuntimeException("No se encontró libro para: " + titulo);
        }
        var data = resp.getResults().get(0);

        var authorApi = data.getAuthors().isEmpty() ? null : data.getAuthors().get(0);
        String nombreAutor = authorApi == null ? "Desconocido" : authorApi.getName();
        Integer nacimiento = authorApi == null ? null : authorApi.getBirthYear();
        Integer fallecimiento = authorApi == null ? null : authorApi.getDeathYear();

        Autor autor = autorRepo.findByNombre(nombreAutor)
                .orElseGet(() -> autorRepo.save(new Autor(null, nombreAutor, nacimiento, fallecimiento, null)));

        Libro libro = new Libro();
        libro.setTitulo(data.getTitle());
        libro.setIdioma(data.getLanguages() != null && !data.getLanguages().isEmpty() ? data.getLanguages().get(0) : "unknown");
        libro.setDescargas(data.getDownloadCount());
        libro.setAutor(autor);

        return libroRepo.save(libro);
    }

    // otros métodos: listar libros, autores, autores vivos, libros por idioma
}
