# Decisiones y piezas que faltan

## Reglas que hay que confirmar
1. **ADP igual al pick**: ¿un jugador con ADP exactamente 8 vale en el pick 1.08? Ahora sí (≥).
2. **Formato del ADP**: ¿el archivo vendrá en pick global (14.3) o en ronda.pick (2.2)? Las dos opciones están soportadas.
3. **Duplicados entre managers**: ¿dos equipos pueden tener el mismo jugador? Ahora sí se permite.
4. **Pick de 1ª ronda**: liga única de 24 con draft de 12, así que cada pick lo pueden coger 2 managers (`maxPorSlot`). Confirmar, y si es por orden de llegada o sorteo.
5. **ADP congelado**: el ADP que se use debe ser una foto fija con fecha, publicada antes de abrir inscripciones; si cambia a mitad, los equipos ya enviados podrían quedar inválidos.
6. **Mínimos y máximos por posición**: propuestos 1 QB, 1 RB, 2 WR, 1 TE, 1 K, 1 DST + 5 RB/WR/TE; máximos 3 QB, 4 TE, 2 K, 2 DST.
7. **Playoffs**: cuartos J15, semis J16, final J17 (por confirmar). Cruces 1-8, 4-5, 2-7, 3-6 según la general; gana quien más puntúa esa semana, empate para el mejor cabeza de serie.
8. **Ganador de jornada repetido**: ahora, si el mejor de una jornada ya está clasificado, la plaza pasa al siguiente de esa jornada (así siempre hay 6 + 2 = 8). Confirmado por Manel el 24/10.
8b. **Empates** en la jornada o en la general: ahora desempata la mejor jornada individual.
8c. **¿Se ven los equipos de los demás antes del cierre?** Ahora sí (`mostrarEquiposAntesDeCierre`).
9. **Jugadores sin ADP / lesionados / cortados**: ¿se pueden elegir jugadores que no están en la lista? Ahora no.
10. **Desempate** y **premios/bote**, si los hay.
11. **Puntuación**: tomada de Fleaflicker 346180 (TE 2 pt por recepción). Pendiente de afinar con las puntuaciones detalladas.

## Piezas técnicas pendientes
- **Envío y almacenamiento**: ahora todo vive en el navegador de cada manager. En Power Pages lo natural es una tabla de Dataverse (Equipos + Picks) con la Web API de Power Pages y validación también en servidor.
- **Identificación**: login (Microsoft/Azure AD B2C en Power Pages) o un código por manager, para que nadie edite el equipo de otro.
- **Validación en servidor**: la del navegador se puede saltar; el servidor debe repetir regla ADP, mínimos y plazo.
- **Vista de clasificación** semanal y carga de puntos (importar de Fleaflicker o CSV semanal).
- **Contraseña por manager** (Manel la repartirá) para que nadie toque otro equipo.
- **Panel de comisionado**: ver los 24 equipos, estado (completo/incompleto), exportar a Excel.
- **Telegram**: enviar automáticamente el resumen al grupo con un bot (requiere backend).
