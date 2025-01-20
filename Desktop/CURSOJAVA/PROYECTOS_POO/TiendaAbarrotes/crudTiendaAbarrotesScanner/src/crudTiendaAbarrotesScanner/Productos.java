package crudTiendaAbarrotesScanner;

public class Productos {

	
	public String nombre;
	public String categoria;
	public float precio;
	public int stock;
	
	
	public Productos() {
	}


	public Productos(String nombre, String categoria, float precio, int stock) {
		this.nombre = nombre;
		this.categoria = categoria;
		this.precio = precio;
		this.stock = stock;
	}


	@Override
	public String toString() {
		return "Productos [nombre=" + nombre + ", categoria=" + categoria + ", precio=" + precio + ", stock=" + stock
				+ "]";
	}


	public String getNombre() {
		return nombre;
	}


	public void setNombre(String nombre) {
		this.nombre = nombre;
	}


	public String getCategoria() {
		return categoria;
	}


	public void setCategoria(String categoria) {
		this.categoria = categoria;
	}


	public float getPrecio() {
		return precio;
	}


	public void setPrecio(float precio) {
		this.precio = precio;
	}


	public int getStock() {
		return stock;
	}


	public void setStock(int stock) {
		this.stock = stock;
	}
	
	
	
	
	
	
	
	
	
	
	
}
