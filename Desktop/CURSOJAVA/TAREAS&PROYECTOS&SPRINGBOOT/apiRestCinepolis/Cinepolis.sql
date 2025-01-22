INSERT INTO Cinepolis VALUES (7,'Parasite', 'Thriller', 130.25);
COMMIT;

CREATE TABLE Cinepolis (
    ID NUMBER PRIMARY KEY, 
    NOMBRE VARCHAR2(100) NOT NULL,      
    GENERO VARCHAR2(50) NOT NULL,       
    PRECIO NUMBER(10, 2) NOT NULL ); 


INSERT INTO Cinepolis VALUES (1,'Avengers: Endgame', 'Acción', 150.00);
INSERT INTO Cinepolis VALUES (2, 'Frozen II', 'Animación', 120.50);
INSERT INTO Cinepolis VALUES (3,'Joker', 'Drama', 140.75);
INSERT INTO Cinepolis VALUES (4,'Toy Story 4', 'Animación', 110.00);
INSERT INTO Cinepolis VALUES (5,'Parasite', 'Thriller', 130.25);

SELECT * FROM CINEPOLIS;


COMMIT;