package com.literalura_springboot.client;


import com.literalura_springboot.dto.BookApiResponse;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.net.http.*;
import java.net.URI;

@Component
public class GutendexClient {
    private final HttpClient client = HttpClient.newHttpClient();
    private final ObjectMapper mapper = new ObjectMapper();

    public BookApiResponse buscarPorTitulo(String titulo) {
        try {
            String q = URI.create("https://gutendex.com/books/?search=" + uriEncode(titulo)).toString();
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(q))
                    .GET()
                    .build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            return mapper.readValue(response.body(), BookApiResponse.class);
        } catch (Exception e) {
            throw new RuntimeException("Error al consumir la API Gutendex", e);
        }
    }

    private String uriEncode(String s) {
        return s.replace(" ", "%20");
    }
}
