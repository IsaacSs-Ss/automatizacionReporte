# Conteo de productos vendidos

Página web que lee el reporte **Ventas por Sucursal** (.xlsx) y muestra cuántas unidades se vendieron de cada producto, por área y comparado contra otros días.

El archivo se procesa **en el navegador**: el Excel no se sube a ningún servidor ni al repositorio.

## Uso

1. Abre la página (GitHub Pages o `index.html` con un servidor local).
2. Arrastra el reporte o haz clic para elegirlo. Puedes subir varios días a la vez.
3. Cada reporte queda guardado en el historial del navegador. Para comparar, elige otro día en **Comparar contra**.
4. Usa **Exportar historial** de vez en cuando como respaldo, o para llevarlo a otra computadora con **Importar historial**.

## De dónde salen los números

Se usa la hoja 3 (**Resumen de Ventas**) y dos tablas:

- **Ventas por platillo / artículo**: venta directa de cada producto por área (PB, PA, TR, PLL, DV). Aquí se ignoran las líneas de los grupos `COMBOS…` y `MOD…`, porque esas cantidades vienen en la tabla de modificadores.
- **Ventas por modificador**: lo que se eligió dentro de los combos (refresco, jugo, 3 tacos dorados…).

Reglas de conteo:

| Producto | Cómo se cuenta |
|---|---|
| Tacos dorados | En piezas: taco suelto = 1, orden de 3 = 3, combo "3 tacos dorados" = 3, combo "2 dorados / 1 …" = 2. Los semidorados entran en el mismo conteo. |
| Guacamole, Nopales | Orden = 1, media orden = 0.5 (2 medias órdenes = 1 orden). No se cuentan las quesadillas de nopal. El dashboard muestra cuántas fueron completas y cuántas medias. |
| Aguacates | 1 pieza = 1 (no hay medias). |
| Agua de horchata, Agua de jamaica | Vasos de 350 ml por área + las que se eligen en combos. |
| Café de olla | Por área + el de los combos. No incluye café americano. |
| Rojo | Solo el refresco "ROJO"; no se cuentan "ROJOS" ni "FRUTOS ROJOS" (sabores de nieve). |
| Jugo | Jugo de 350 ml y el jugo de los combos. |
| Resto | 1 línea vendida = 1 unidad. |

En la sección **Ver qué líneas del Excel se contaron** de la página se puede revisar cada línea que sumó.

Para agregar o cambiar productos, edita la lista `PRODUCTOS` en [`parser.js`](parser.js). El historial guarda las líneas originales de cada reporte, así que los días ya subidos se recalculan solos con las reglas nuevas.

Las fotos de las categorías se cargan del menú oficial (barbacoamx.com). Si alguna no carga, la tarjeta se queda con el fondo café.

## Publicar en GitHub Pages

```bash
git init
git add .
git commit -m "Dashboard de conteo de productos"
git branch -M main
git remote add origin https://github.com/<tu-usuario>/<repo>.git
git push -u origin main
```

Después, en GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / root**.

> GitHub Pages en repos privados requiere plan de pago. Si el repo es público, solo se ve el código de la página; los reportes y el historial no salen de tu navegador.

## Probar en local

```bash
python -m http.server 8123
```

Luego abre http://localhost:8123.
