package com.literalura_springboot;

import com.literalura_springboot.service.MenuService;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
public class LiteraluraSpringbootApiApplication {

	public static void main(String[] args) {
		SpringApplication.run(LiteraluraSpringbootApiApplication.class, args);

	}

    @Bean
    CommandLineRunner runner(MenuService menuService) {
        return args -> menuService.mostrarMenu();
    }




}
