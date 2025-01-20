package crudTiendaAbarrotesScanner;

import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;


public class Principal {


	@SuppressWarnings({ "unused", "resource" })
	public static void main(String[] args) {
		
		 Scanner lectura = null; 
		
		 String nombre;
		 String categoria;
		 float precio; 
		 int stock;
	     int menuPrincipal, indice,subMenu;
	     double dineroInvertido;
	     
		 	 
	     Productos producto = null;
	      
		 List<Productos> listaProductos = new ArrayList<>();
	
		do {
			
			
			System.out.println("CRUD DE Tienda de Abarrotes: ");
			System.out.println("1--- Alta");
			System.out.println("2--- Mostrar");
			System.out.println("3--- Buscar");
			System.out.println("4--- Editar");
			System.out.println("5--- Buscar por nombre");
			System.out.println("6--- Buscar por categoria"); //ESTE ES UN VALOR UNICO
			System.out.println("7--- Calcular dinero Invertido"); //ESTE SI SE PUEDE REPETIR
			System.out.println("8--- Eliminar por nombre");
			System.out.println("9--- Salir"); 
			lectura = new Scanner(System.in); 
			menuPrincipal = lectura.nextInt(); 
			
			
			switch(menuPrincipal) {
			
			case 1:
			
				try {
				System.out.println("Ingrese el nombre del producto: ");
				lectura = new Scanner(System.in);
				nombre = lectura.nextLine();
				
				System.out.println("Ingresa la categoria del producto: ");
				lectura = new Scanner(System.in);
				categoria = lectura.nextLine();
				
				System.out.println("Ingresa el precio del producto: ");
				lectura = new Scanner(System.in);
				precio = lectura.nextFloat();
				
				System.out.println("Ingresa el stock del producto: ");
				lectura = new Scanner(System.in);
				stock = lectura.nextInt(); 
				
				producto = new Productos(nombre, categoria, precio, stock);
				
				
				// agregar a la lista
				listaProductos.add(producto);
				
				System.out.println("Se guardo con exito");
				
				} catch (Exception e) {
					
					// TODO: handle exception
					System.out.println("Error al guardar " + e.getMessage());
					
				}
				break;
			
				
			case 2:
				
				System.out.println(listaProductos);
				break;
				
			case 3:
				 
				try {
					System.out.println("Ingresa el indice a buscar");
					lectura = new Scanner(System.in);
					indice = lectura.nextInt();	
					producto = listaProductos.get(indice);
					System.out.println("Se encontro el registro " + producto);
									
				}
				
				catch(Exception e) {
					// TODO: handle exception
					System.out.println("Error al buscar ");
					
				}
				break;
		
				
				
			case 4:
				

				try {
					System.out.println("Ingresa el indice a editar");
					lectura = new Scanner(System.in);
					indice = lectura.nextInt();
					producto = listaProductos.get(indice);
					System.out.println("Se encontro el registro " + producto);
					
					// Sub menu --- marca & el precio 
					do {
						System.out.println(" SUBMENU PARA EDITAR ");
						System.out.println(" 1--Nombre");
						System.out.println(" 2--Categoria");
						System.out.println(" 3--Precio");
						System.out.println(" 4--Stock");
						
						lectura = new Scanner(System.in);
						subMenu = lectura.nextInt();
						
						
						switch (subMenu) {
						
						case 1:
							System.out.println("Ingrese la nueva marca");
							lectura = new Scanner(System.in);
							nombre = lectura.nextLine();
							
							// Actualizacion
							producto.setNombre(nombre);
							System.out.println("Se edito con exito ");
							break; 

						case 2:
							System.out.println("Ingrese Categoria ");
							lectura = new Scanner(System.in);
							categoria = lectura.nextLine();
							
							// Actualizacion
							producto.setCategoria(categoria);
							System.out.println("Se edito correctamente ");
							break;

							
						case 3:
							System.out.println("Ingrese el nuevo precio");
							lectura = new Scanner(System.in);
							precio = lectura.nextFloat();
							
							// Actualizacion
							producto.setPrecio(precio);
							System.out.println("Se edito correctamente ");
							
							
							break; 
							
		
							
						case 4:
							
							System.out.println("Ingrese el nuevo stock ");
							lectura = new Scanner(System.in);
							stock = lectura.nextInt();
							
							// Actualizacion
							producto.setStock(stock);
							System.out.println("Se edito correctamente ");
							
							
							
							break; 
							
							 
						}
						
					} while (subMenu<4); 
					
				}
				catch(Exception e) {
					// TODO: handle exception
					System.out.println("Error al buscar ");
					
				}
				
				
				break;
		
				
			case 5:
				
				try {
					 // Buscar por nombre de producto
	                System.out.println("Ingrese el nombre del producto a buscar: ");
	                lectura = new Scanner(System.in);
	                nombre = lectura.nextLine(); 
	                
	               for(int i=0; i<listaProductos.size();i++) {
	            	   if(listaProductos.get(i).getNombre().equals(nombre)) {
	            		   System.out.println(listaProductos.get(i));
	            		   break; // detenga la busqueda cuando lo encuntra y no realiza todas las iteraciones
	            	   
	            	   }
	               }
	                    
				}
					
				catch(Exception e)
				{ 
					System.out.println("Producto no encontrado");  
					}
				break;
				
				
				
			case 6:
				
			    try {
			        // Buscar por categoria
			        System.out.println("Ingrese la categoria a buscar: ");
			        lectura = new Scanner(System.in);
			        categoria = lectura.nextLine();

			        boolean encontrado = false;
			        for (Productos productos: listaProductos) {
			            if (productos.getCategoria().equalsIgnoreCase(categoria)) {
			                System.out.println(categoria);
			                encontrado = true;
			            }
			        }
			        if (!encontrado) {
			            System.out.println("No se encontro la categoria del producto: " + categoria);
			        }
			    } catch (Exception e) {
			        System.out.println("Error al buscar por categoria: " + e.getMessage());
			    }
			    break;
				
				
			case 7:
				
			    try {
			        // Dinero invertido:   Producto1: precio * stock + Producto2: precio*stock ....
			    	
			        System.out.println("Calculando el total de dinero invertido ");
			        
			        dineroInvertido = 0; 
			        
			        for(int i=0; i<listaProductos.size();i++) {
			        	
			        	dineroInvertido = dineroInvertido+(listaProductos.get(i).getPrecio()*listaProductos.get(i).getStock());
			        				        	
			        }
			        
         		   System.out.println("El total del dinero invertido es: " + dineroInvertido);

		            		   break; // detenga la busqueda cuando lo encuntra y no realiza todas las iteraciones
		            	   
			        
			    } catch (Exception e) {
			        System.out.println("Error al calcular el dinero invertido : " + e.getMessage());
			    }
			    break;
				
				
				
				
			case 8:
				
			     try {
			    	   System.out.println("Ingrese el indice a eliminar");
				       lectura = new Scanner(System.in);
				       indice = lectura.nextInt();
				
				        // Eliminación
				
				        listaProductos.remove(indice);
				        System.out.println("Se elimino ");
			} catch (Exception e) {
				//TODO: handle exception
				
				System.out.println("Error al eliminar");
				
			}
				
				break;
				
				
			case 9: 
				break;
			
			
			}
			
			
		} while(menuPrincipal<9);
		
		
	
		
 }}
