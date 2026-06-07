# 📚 LiterAlura – Catálogo de Libros con Spring Boot + JPA + PostgreSQL  
### 🔥 Desafío Backend – Consumo de API, Persistencia y Consultas

LiterAlura es un proyecto desarrollado como parte de un desafío práctico de backend.  
El objetivo es construir un **catálogo de libros con interacción por consola**, que consulta datos en tiempo real desde la API pública **Gutendex**, los convierte a objetos Java, los guarda en una base de datos relacional y permite realizar búsquedas, filtros y estadísticas avanzadas.

El proyecto está construido con **Java 17**, **Spring Boot 3.2.3**, **JPA/Hibernate**, **PostgreSQL** y utiliza **HttpClient + Jackson** para consumir y procesar JSON.

---

## 🧠 **Objetivo del Proyecto**

Crear un sistema capaz de:

- Consultar libros por título desde la API Gutendex
- Convertir la respuesta JSON a entidades Java
- Almacenar libros y autores en PostgreSQL
- Interactuar con el usuario mediante un menú de consola
- Listar libros, autores y estadísticas del catálogo
- Realizar consultas avanzadas (libros por idioma, autores vivos, etc.)

---

## 🏗️ **Arquitectura del Proyecto**

LiterAlura
│
├── src/main/java/com/literalura_springboot
│ ├── controller/ → Interacción con usuario (CommandLineRunner)
│ ├── model/ → Entidades JPA (Libro, Autor)
│ ├── repository/ → Repositorios Spring Data JPA
│ ├── service/ → Lógica de negocio (API, conversiones, filtros)
│ ├── config/ → Configuraciones (si aplica)
│ ├── dto/ → Objetos para manejar JSON de Gutendex
│ └── LiterAluraApplication.java
│
├── src/main/resources/
│ ├── application.properties
│ └── data.sql / schema.sql (opcional)
│
└── pom.xml


---

## 🛠️ **Tecnologías Utilizadas**

- **Java 17+**
- **Spring Boot 3.2.3**
- **Maven 4**
- **Spring Data JPA**
- **PostgreSQL 16**
- **Jackson 2.16 (JSON -> Java)**
- **HttpClient (Java 11+)**
- **Hibernate ORM**
- **IntelliJ IDEA / VS Code**

---

## 🚀 Instalación y Ejecución

### 1️⃣ Clonar el repositorio

```bash
git clone https://github.com/TU-USUARIO/literalura.git
cd literalura



