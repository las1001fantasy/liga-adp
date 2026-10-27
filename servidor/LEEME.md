# Servidor de equipos (Google Sheets + Apps Script)

Guarda los equipos con contraseña y no enseña ningún roster hasta el cierre
(miércoles 4 nov 2026, 22:00 de Barcelona). Es gratis. Se monta una vez, unos 5 minutos.

## Montarlo

1. Crea una hoja de cálculo nueva en Google Drive (por ejemplo "Liga ADP 2026").
2. Menú **Extensiones → Apps Script**. Borra lo que haya y pega el contenido de `Codigo.gs`. Guarda.
3. Arriba, elige la función **prepararHoja** y pulsa **Ejecutar**. Google pedirá permisos
   (es tu propio script: "Configuración avanzada → Ir a…"). Crea dos pestañas:
   - **Managers**: los 23 equipos con su contraseña aleatoria. Esta pestaña es privada: no la compartas.
   - **Equipos**: aquí aparece cada roster según lo van guardando.
4. **Implementar → Nueva implementación → Aplicación web**:
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
   Copia la URL que termina en `/exec`.
5. Pon esa URL en `js/config.js`, en `servidor: "…/exec"`, y sube el cambio.
6. Manda a cada manager su contraseña por privado en Telegram.

`prepararHoja` lee la lista de managers y el ADP de la web publicada (`CONFIG.web`, https://adp.las1001fantasy.com/, al principio del
script). Si la web está en otra dirección, cámbiala ahí antes de ejecutarlo.

## Día a día

- **Plaza 24 o cambio de manager:** añade la fila en "Managers" (equipo, telegram) y ejecuta
  `rellenarContrasenasVacias`. Añádelo también a `data/managers.json` para que salga en el desplegable.
- **Un manager pierde la contraseña:** mírala en "Managers" o cámbiala ahí mismo.
- **Cambiar el cierre:** `CONFIG.cierre` en el script y `fechaLimite` en `js/config.js`.
  Tras tocar el script: Implementar → Gestionar implementaciones → editar → Nueva versión.

## Qué comprueba el servidor

- La contraseña (10 intentos fallidos bloquean ese equipo 10 minutos).
- Si `maxPorSlot` es mayor que 0, que no haya más managers que ese número en el mismo pick de 1ª ronda (ahora es 0: sin límite).
- Que no se guarde nada después del cierre.
- La regla del ADP, los repetidos y los mínimos por posición. Un borrador incompleto se guarda,
  pero tras el cierre solo cuentan los picks válidos.
- Antes del cierre solo enseña quién se ha inscrito, su pick de 1ª ronda y si está completo.
