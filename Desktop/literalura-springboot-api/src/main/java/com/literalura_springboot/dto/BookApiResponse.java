package com.literalura_springboot.dto;


import java.util.List;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class BookApiResponse {
    private List<BookApiData> results;
    // getters y setters


    public List<BookApiData> getResults() {
        return results;
    }

    public void setResults(List<BookApiData> results) {
        this.results = results;
    }
}
