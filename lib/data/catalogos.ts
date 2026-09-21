/** Nombres, razas y catálogos para generar datos que suenen chilenos. */

export const NOMBRES = [
  "Camila", "Matías", "Valentina", "Benjamín", "Josefa", "Vicente",
  "Antonia", "Martín", "Florencia", "Joaquín", "Isidora", "Agustín",
  "Emilia", "Tomás", "Catalina", "Cristóbal", "Fernanda", "Diego",
  "Javiera", "Sebastián", "Constanza", "Nicolás", "Trinidad", "Felipe",
  "Amanda", "Lucas", "Magdalena", "Rodrigo", "Paula", "Andrés",
  "Sofía", "Ignacio", "Daniela", "Gabriel", "Rocío", "Mauricio",
  "Carolina", "Pablo", "Francisca", "Esteban",
] as const;

export const APELLIDOS = [
  "González", "Muñoz", "Rojas", "Díaz", "Pérez", "Soto", "Contreras",
  "Silva", "Martínez", "Sepúlveda", "Morales", "Rodríguez", "López",
  "Fuentes", "Hernández", "Torres", "Araya", "Flores", "Espinoza",
  "Valenzuela", "Castillo", "Tapia", "Reyes", "Gutiérrez", "Castro",
  "Vergara", "Álvarez", "Vásquez", "Sandoval", "Carrasco",
] as const;

export const NOMBRES_PERRO = [
  "Pelusa", "Rocco", "Luna", "Simón", "Kira", "Tobi", "Maia", "Bruno",
  "Nala", "Pancho", "Frida", "Chocolo", "Olivia", "Balto", "Mora",
  "Gaspar", "Lola", "Dante", "Chispa", "Ruso", "Maggie", "Coco",
  "Pepa", "Milo", "Nube", "Tomate", "Canela", "Ñeco", "Uma", "Zeus",
  "Pituca", "Barto", "Kiara", "Osito", "Cleo", "Lucho", "Menta",
  "Tuco", "Polenta", "Ramón", "Gala", "Chico", "Mila", "Peluche",
  "Pochi", "Tita", "Bowie", "Suri", "Lentejo", "Chispita",
] as const;

/** Razas coherentes con el tope de 20 kg. */
export const RAZAS = [
  { nombre: "Quiltro", pesoMin: 6, pesoMax: 18 },
  { nombre: "Beagle", pesoMin: 9, pesoMax: 14 },
  { nombre: "Cocker Spaniel", pesoMin: 11, pesoMax: 15 },
  { nombre: "Fox Terrier", pesoMin: 6, pesoMax: 9 },
  { nombre: "Schnauzer", pesoMin: 5, pesoMax: 9 },
  { nombre: "Poodle", pesoMin: 4, pesoMax: 8 },
  { nombre: "Shih Tzu", pesoMin: 4, pesoMax: 7 },
  { nombre: "Bulldog Francés", pesoMin: 9, pesoMax: 13 },
  { nombre: "Border Collie", pesoMin: 14, pesoMax: 19 },
  { nombre: "Basset Hound", pesoMin: 16, pesoMax: 20 },
  { nombre: "Jack Russell", pesoMin: 5, pesoMax: 8 },
  { nombre: "Salchicha", pesoMin: 5, pesoMax: 9 },
  { nombre: "Westie", pesoMin: 6, pesoMax: 10 },
  { nombre: "Cavalier", pesoMin: 6, pesoMax: 9 },
  { nombre: "Mestizo pequeño", pesoMin: 4, pesoMax: 10 },
] as const;

/** Providencia y alrededores: de dónde viene la gente. */
export const COMUNAS = [
  "Providencia", "Providencia", "Providencia", "Ñuñoa", "Ñuñoa",
  "Las Condes", "Santiago Centro", "La Reina", "Vitacura", "Macul",
] as const;

export const CALLES = [
  "Av. Providencia", "Los Leones", "Pedro de Valdivia", "Manuel Montt",
  "Av. Italia", "Bilbao", "Seminario", "Antonio Varas", "Holanda",
  "Salvador", "Condell", "General Holley",
] as const;

export const NOTAS_PERRO = [
  "Le cuesta compartir los juguetes, pero se relaja después de un rato.",
  "Muy sociable, se lleva bien con todos.",
  "Come dos veces al día, trae su comida en bolsita.",
  "Tiene miedo a los ruidos fuertes.",
  "Regalón, busca upa todo el día.",
  "Juega fuerte con los grandes, ojo con los chiquititos.",
  "Duerme siesta después de almuerzo.",
  "Toma remedio para la alergia en la mañana.",
  "Se escapa si la puerta queda abierta.",
  "Le encanta el agua.",
] as const;

export const NOTAS_REPORTE = [
  "Día tranquilo, durmió siesta a las 14:00 y comió todo.",
  "Jugó toda la mañana con la manada chica, llegó cansadísimo.",
  "Hoy tomó sol en el patio como dos horas, feliz.",
  "Se hizo amigo de los nuevos, muy buena onda.",
  "Almorzó bien y después no quiso salir de la cama del living.",
  "Anduvo con harta energía, correteó a todos.",
  "Estuvo pegado a nosotros todo el día pidiendo cariño.",
  "Primera vez que se atreve a jugar con los grandes.",
  "Día de juegos de agua, salió empapado y contento.",
  "Tranquilo, prefirió quedarse adentro con los más calmados.",
] as const;

export const DESCRIPCIONES_INCIDENTE = {
  comportamiento: [
    "Gruñó cuando otro perro se acercó a su plato.",
    "Le costó calmarse después del recreo, lo separamos un rato.",
    "Se puso ansioso cuando llegaron perros nuevos.",
  ],
  salud: [
    "Vomitó una vez en la mañana, después comió normal.",
    "Se le notó una cojera leve en la pata trasera.",
    "Anduvo decaído, no quiso jugar.",
  ],
  pelea: [
    "Encontrón con otro perro por un juguete, sin heridas.",
    "Se trenzaron dos segundos, los separamos al tiro.",
  ],
  escape: [
    "Intentó salir por el portón cuando entró una visita.",
    "Se subió al sillón para alcanzar la ventana.",
  ],
  otro: [
    "Rompió un juguete y se comió un pedazo, quedamos atentos.",
    "Se sacó el collar dos veces en el día.",
  ],
} as const;

export const PRODUCTOS = [
  { nombre: "Alimento premium adulto 3 kg", categoria: "alimento", precio: 24_900, descripcion: "Croquetas para perro adulto de razas pequeñas y medianas." },
  { nombre: "Alimento premium cachorro 3 kg", categoria: "alimento", precio: 26_900, descripcion: "Fórmula con más proteína para etapa de crecimiento." },
  { nombre: "Alimento húmedo lata 340 g", categoria: "alimento", precio: 3_490, descripcion: "Paté de pollo, ideal para mezclar con las croquetas." },
  { nombre: "Snack dental x 7", categoria: "snack", precio: 6_990, descripcion: "Para el sarro y el aliento, uno al día." },
  { nombre: "Galletas de manzana artesanales", categoria: "snack", precio: 4_500, descripcion: "Hechas acá mismo, sin azúcar ni conservantes." },
  { nombre: "Hueso prensado natural", categoria: "snack", precio: 2_990, descripcion: "Para los que necesitan masticar horas." },
  { nombre: "Pelota de goma resistente", categoria: "juguete", precio: 7_990, descripcion: "Sobrevive a los mordedores profesionales." },
  { nombre: "Cuerda trenzada", categoria: "juguete", precio: 5_490, descripcion: "Para jugar a tirar sin quedarse sin brazo." },
  { nombre: "Peluche con chirrido", categoria: "juguete", precio: 6_500, descripcion: "El favorito de los que duermen abrazados." },
  { nombre: "Kong rellenable mediano", categoria: "juguete", precio: 12_900, descripcion: "Lo llenas de paté y te regala media hora de paz." },
  { nombre: "Collar de cuero con placa", categoria: "accesorio", precio: 14_900, descripcion: "Con grabado del nombre y tu teléfono." },
  { nombre: "Correa antitirones 1,5 m", categoria: "accesorio", precio: 11_900, descripcion: "Para los que salen a pasear al dueño." },
  { nombre: "Cama redonda lavable", categoria: "accesorio", precio: 29_900, descripcion: "Funda que se saca y va a la lavadora." },
  { nombre: "Shampoo hipoalergénico 500 ml", categoria: "higiene", precio: 8_900, descripcion: "Para pieles sensibles, sin perfume fuerte." },
  { nombre: "Toallitas húmedas x 80", categoria: "higiene", precio: 4_990, descripcion: "Para las patas después del paseo." },
  { nombre: "Cepillo deslanador", categoria: "higiene", precio: 9_500, descripcion: "Saca el pelo suelto antes de que llegue al sillón." },
] as const;

export const STAFF = ["Cata", "Nico", "Jorge", "Pili"] as const;
