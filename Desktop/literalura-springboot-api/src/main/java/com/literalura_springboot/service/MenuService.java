package com.literalura_springboot.service;


import com.literalura_springboot.model.Libro;
import com.literalura_springboot.repository.AutorRepository;
import com.literalura_springboot.repository.LibroRepository;
import org.springframework.stereotype.Service;
import java.util.Scanner;

@Service
public class MenuService {
    private final GutendexService gutendexService;
    private final LibroRepository libroRepo;
    private final AutorRepository autorRepo;
    private final Scanner scanner = new Scanner(System.in);

    public MenuService(GutendexService gutendexService, LibroRepository libroRepo, AutorRepository autorRepo) {
        this.gutendexService = gutendexService;
        this.libroRepo = libroRepo;
        this.autorRepo = autorRepo;
    }

    public void mostrarMenu() {
        int opcion;
        do {
            System.out.println("\n=== LITERALURA ===");
            System.out.println("1 - Buscar libro por título (API -> guardar)");
            System.out.println("2 - Listar todos los libros (BD)");
            System.out.println("3 - Listar autores (BD)");
            System.out.println("4 - Listar autores vivos en un año");
            System.out.println("5 - Listar libros por idioma");
            System.out.println("0 - Salir");
            System.out.print("Opción: ");
            opcion = Integer.parseInt(scanner.nextLine());
            switch (opcion) {
                case 1 -> buscar();
                case 2 -> listarLibros();
                case 3 -> listarAutores();
                case 4 -> autoresVivos();
                case 5 -> librosPorIdioma();
                case 0 -> System.out.println("Saliendo...");
                default -> System.out.println("Opción inválida");
            }
        } while (opcion != 0);
    }

    private void buscar() {
        System.out.print("Título a buscar: ");
        String titulo = scanner.nextLine();
        Libro l = gutendexService.buscarYGuardarPrimerResultado(titulo);
        System.out.println("Guardado: " + l.getTitulo() + " - " + l.getIdioma());
    }

    private void listarLibros() {
        libroRepo.findAll().forEach(l -> System.out.println(l.getId() + " - " + l.getTitulo() + " (" + l.getIdioma() + ") - " + l.getDescargas()));
    }

    private void listarAutores() {
        autorRepo.findAll().forEach(a -> System.out.println(a.getId() + " - " + a.getNombre()));
    }

    private void autoresVivos() {
        System.out.print("Año: ");
        int year = Integer.parseInt(scanner.nextLine());
        // Implementa repository custom para nulos o usa query manual
        autorRepo.findAll().stream()
                .filter(a -> a.getNacimiento()!=null && a.getNacimiento()<=year && (a.getFallecimiento()==null || a.getFallecimiento()>year))
                .forEach(a -> System.out.println(a.getNombre() + " ("+ a.getNacimiento() + "-" + a.getFallecimiento()+")"));
    }

    private void librosPorIdioma() {
        System.out.print("Idioma (ej. en, es): ");
        String idioma = scanner.nextLine();
        libroRepo.findByIdioma(idioma).forEach(l -> System.out.println(l.getTitulo() + " - " + l.getAutor().getNombre()));
    }
}
