# Sistema de registro de trabajo y pagos

## Estado

Primera implementación en curso.

## Milestone 1

Sistema de registro de pagos.

la persona administradora cargará los datos enviados por los trabajadores mediante una interfaz web responsive.

## Formas de carga

- Carga manual de entradas y salidas.
- Pegado de conversaciones para que Coddy intente identificar quién, cuándo y dónde.
- API documentada para crear y modificar registros desde Coddy u otros agentes.

## Decisiones de diseño

- La carga manual será simple y mostrará el último registro de la persona.
- Habrá alertas por horarios solapados entre obras y por entradas sin salida al finalizar el día.
- Las alertas mostrarán el detalle de los registros que requieren atención.
- Las alertas por falta de salida serán visibles únicamente para administración.
- Las alertas no impedirán guardar el registro.
- Los registros interpretados por Coddy serán borradores que la persona administradora deberá revisar y confirmar.
- La interfaz web, Coddy y otros agentes utilizarán la misma API.
- La API se documentará con OpenAPI y aplicará las mismas validaciones y alertas que la interfaz web.
- Cada registro mostrará las horas trabajadas.
- Se podrá navegar por días anteriores.
- Los resúmenes podrán agruparse por persona o por obra.
- Los resúmenes agrupados podrán expandirse para mostrar el detalle por obra o persona.
- Una jornada de trabajo equivaldrá a 8 horas.
- La semana comenzará el domingo y terminará al comenzar el domingo siguiente.
- El jefe de cuadrilla verá las personas asignadas a su obra.
- El primer toque registrará el ingreso con la hora actual y mostrará la persona en verde.
- El segundo toque registrará la salida con la hora actual.
- El toque siguiente creará un nuevo registro para la misma persona y obra.
- Cada persona mostrará todos sus registros y el total de horas.
- Cada registro podrá editarse y borrarse individualmente.
- Las horas de ingreso y salida podrán editarse.
- La salida podrá incluir un motivo opcional.
- El jefe de cuadrilla podrá cerrar todos los turnos abiertos de su obra con la hora actual.

## Perfiles

### Jefe de cuadrilla

- Tendrá una obra asignada y verá sus personas.
- Usará una interfaz mobile similar a la iteración 3.
- Podrá ver el resumen semanal de su obra y navegar hacia atrás.
- Podrá corregir registros hasta una semana hacia atrás.

### Administrador

- Verá todas las obras.
- Usará una interfaz similar a la iteración 2, sin el panel de carga.
- Podrá alternar entre resúmenes diarios y semanales.
- Podrá consultar resúmenes agrupados por obra o persona.
- Podrá abrir un registro en un modal para corregirlo.
- Podrá crear e inactivar personas.
- Podrá asignar una persona a una o más obras.
- Podrá asignarle opcionalmente usuario, contraseña y perfil.
- Podrá crear y renombrar obras, y gestionar sus personas activas.
- Podrá ver quién creó cada registro y su historial de cambios.

### Acceso

- El sistema tendrá login.
- La interfaz y los permisos dependerán del perfil.
- Los permisos también se aplicarán en la API.
- Los usuarios y contraseñas podrán definirse desde la administración o mediante comandos administrativos.
- No habrá recupero de contraseña inicialmente.
- La web usará sesiones y los agentes usarán tokens revocables.

## Implementación

- Backend con FastAPI, SQLAlchemy, Alembic y pytest.
- Base de datos SQLite.
- API versionada bajo `/api/v1` y documentada con OpenAPI.
- Zona horaria configurable, con `America/Argentina/Buenos_Aires` por defecto.
- Correcciones auditadas y borrado lógico.

## Problemas actuales

- La información se envía sin una estructura definida.
- Faltan datos que luego hay que reclamar.
- Surgen reclamos posteriores por datos registrados incorrectamente.
