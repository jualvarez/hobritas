# Instrucciones

- No escribir código sin autorización expresa de Juan.
- Mantener todos los archivos Markdown minimalistas y concretos.
- Registrar únicamente decisiones y problemas que hayan sido tratados.
- No inventar ni anticipar problemas inexistentes.
- Asumir que todo el repositorio será público.
- No guardar registros identificables, claves ni secretos en archivos publicables.
- Guardar toda configuración en `.env`.
- Publicar únicamente `.env.template` con valores de ejemplo no sensibles.
- Aplicar el gate `red/fix/green` en cada iteración: test que falla, corrección y suite completa en verde.
- No cerrar una iteración con tests fallidos.

# Decisiones

- la persona administradora cargará los datos enviados por los trabajadores.
- La interfaz será web responsive.
- la persona administradora podrá pegar una conversación para que Coddy intente identificar quién, cuándo y dónde.
- Una API documentada permitirá crear y modificar registros desde Coddy u otros agentes.
- Validar la interfaz mediante iteraciones rápidas y separadas.
- Guardar cada prueba en `iteraciones/iteracion-N`.
- Usar FastAPI, SQLAlchemy, Alembic y pytest para el backend.
- Usar SQLite inicialmente.
- Versionar la API bajo `/api/v1` y documentarla con OpenAPI.
- Configurar la zona horaria mediante `.env`, con hora argentina por defecto.
- Crear usuarios y contraseñas mediante comandos administrativos.
- No implementar recupero de contraseña por ahora.
- Usar sesiones web y tokens revocables para agentes.
- Auditar correcciones y usar borrado lógico.
