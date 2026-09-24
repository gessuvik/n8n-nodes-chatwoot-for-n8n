# Acciones de Chatwoot

Versión del paquete: `0.2.0`. Referencia de API: Chatwoot `4.17.0`.

Todas las rutas parten de:

```text
/api/v1/accounts/{account_id}
```

El `account_id`, la Base URL y el header `api_access_token` salen de la credencial **Chatwoot
API**. Ninguna acción pide esos valores dentro del workflow.

## Contact (Lead) — 20 operaciones

| Operación                | Llamada principal                                           | Comportamiento útil                                                         |
| ------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------- |
| Create                   | `POST /contacts`                                            | Crea el contacto y lo conecta a un inbox                                    |
| Get                      | `GET /contacts/{contact_id}`                                | Devuelve el contacto completo                                               |
| Get Many                 | `GET /contacts`                                             | Pagina contactos resueltos                                                  |
| Search                   | `GET /contacts/search`                                      | Busca en nombre, email, teléfono e identifier                               |
| Find Exact               | `GET /contacts/search`                                      | Filtra la búsqueda y exige coincidencia exacta                              |
| Update                   | `PATCH /contacts/{contact_id}`                              | Envía únicamente los campos seleccionados                                   |
| Create or Update         | `GET /contacts/search`, luego `POST` o `PATCH`              | Upsert exacto por email, teléfono o identifier                              |
| Set Blocked State        | `PATCH /contacts/{contact_id}`                              | Bloquea o desbloquea explícitamente                                         |
| Get Custom Attribute     | `GET /custom_attribute_definitions`, `GET /contacts/{id}`   | Resuelve dropdown, clave o ID y devuelve un valor                           |
| Set Custom Attribute     | `GET /custom_attribute_definitions`, `PATCH /contacts/{id}` | Convierte el tipo y hace merge de una sola clave                            |
| Remove Custom Attributes | `GET /custom_attribute_definitions`, `POST /destroy_...`    | Elimina solo las definiciones elegidas                                      |
| Set Additional Attribute | `PATCH /contacts/{contact_id}`                              | Hace merge de un atributo libre                                             |
| Get Labels               | `GET /contacts/{contact_id}/labels`                         | Devuelve títulos aplicados                                                  |
| Add Labels               | `GET`, luego `POST /contacts/{contact_id}/labels`           | Conserva las existentes y agrega                                            |
| Remove Labels            | `GET`, luego `POST /contacts/{contact_id}/labels`           | Conserva las no seleccionadas                                               |
| Replace Labels           | `POST /contacts/{contact_id}/labels`                        | Reemplazo completo e intencional                                            |
| Get Conversations        | `GET /contacts/{contact_id}/conversations`                  | Lista conversaciones del lead                                               |
| Connect to Inbox         | `POST /contacts/{contact_id}/contact_inboxes`               | Crea la relación necesaria para conversar                                   |
| Merge                    | `POST /actions/contact_merge`                               | Mantiene el base y elimina permanentemente el mergee                        |
| Delete                   | `DELETE /contacts/{contact_id}`                             | Requiere confirmación; Chatwoot puede rechazar contactos actualmente online |

## Conversation — 22 operaciones

| Operación                 | Llamada principal                                                      | Comportamiento útil                                                                |
| ------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Create                    | `POST /conversations`                                                  | Inbox y contacto por dropdown/ID; source ID opcional                               |
| Get                       | `GET /conversations/{conversation_id}`                                 | Usa el display ID que muestra Chatwoot                                             |
| Get Many                  | `GET /conversations`                                                   | Filtros de estado, asignación, inbox, equipo, labels, mensaje y rango de actividad |
| Set Status                | `POST /conversations/{id}/toggle_status`                               | Open, pending, resolved o snoozed                                                  |
| Set Priority              | `POST /conversations/{id}/toggle_priority`                             | None, low, medium, high o urgent                                                   |
| Assign Agent              | `POST /conversations/{id}/assignments`                                 | Agente por dropdown                                                                |
| Unassign Agent            | `POST /conversations/{id}/assignments`                                 | Envía `assignee_id: null`                                                          |
| Assign Team               | `POST /conversations/{id}/assignments`                                 | Equipo por dropdown                                                                |
| Unassign Team             | `POST /conversations/{id}/assignments`                                 | Envía `team_id: 0`                                                                 |
| Get Custom Attribute      | `GET /custom_attribute_definitions`, `GET /conversations/{id}`         | Devuelve una clave definida                                                        |
| Set Custom Attribute      | dos `GET`, luego `POST /conversations/{id}/custom_attributes`          | Lee, hace merge local y escribe; también envía `merge: true`                       |
| Remove Custom Attributes  | `GET /custom_attribute_definitions`, `POST /destroy_custom_attributes` | Elimina solo claves elegidas                                                       |
| Replace Custom Attributes | `POST /conversations/{id}/custom_attributes`                           | Reemplazo total; operación avanzada y explícita                                    |
| Get Labels                | `GET /conversations/{id}/labels`                                       | Devuelve títulos aplicados                                                         |
| Add Labels                | `GET`, luego `POST /conversations/{id}/labels`                         | Merge seguro                                                                       |
| Remove Labels             | `GET`, luego `POST /conversations/{id}/labels`                         | Resta segura                                                                       |
| Replace Labels            | `POST /conversations/{id}/labels`                                      | Reemplazo total e intencional                                                      |
| Mute                      | `POST /conversations/{id}/mute`                                        | Silencia para el usuario del token                                                 |
| Unmute                    | `POST /conversations/{id}/unmute`                                      | Restaura notificaciones                                                            |
| Mark Read                 | `POST /conversations/{id}/update_last_seen`                            | Actualiza el último visto                                                          |
| Mark Unread               | `POST /conversations/{id}/unread`                                      | Coloca el visto antes del último incoming                                          |
| Delete                    | `DELETE /conversations/{id}`                                           | Requiere confirmación                                                              |

## Message — 7 operaciones

| Operación               | Llamada                                            | Nota                                                         |
| ----------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| Get Many                | `GET /conversations/{id}/messages`                 | Pagina hacia atrás sin duplicar mensajes                     |
| Send Message            | `POST /conversations/{id}/messages`                | Outgoing, content type y reply-to opcional                   |
| Add Private Note        | `POST /conversations/{id}/messages`                | Envía `private: true`; el contacto no la recibe              |
| Create Incoming Message | `POST /conversations/{id}/messages`                | Solo funciona en API inboxes                                 |
| Send WhatsApp Template  | `POST /conversations/{id}/messages`                | Nombre, idioma, categoría, body y header sin JSON manual     |
| Update Delivery Status  | `PATCH /conversations/{id}/messages/{message_id}`  | Solo API inbox; sent, delivered, read o failed               |
| Delete                  | `DELETE /conversations/{id}/messages/{message_id}` | Requiere confirmación; Chatwoot marca el contenido eliminado |

La versión `0.2.0` cubre mensajes de texto, notas y plantillas con header por URL. Adjuntos
binarios multipart no están expuestos todavía como operación independiente.

## Recursos administrativos

| Recurso          | Operaciones                                                           |
| ---------------- | --------------------------------------------------------------------- |
| Custom Attribute | Get Many, Get, Create, Update, Delete                                 |
| Label            | Get Many, Get, Create, Update, Delete                                 |
| Agent            | Get Many, Create, Update, Delete                                      |
| Team             | Get Many, Get, Create, Update, Delete, Get/Add/Replace/Remove Members |
| Inbox            | Get Many, Get, Update                                                 |

Crear, actualizar o eliminar agentes, equipos, labels, definiciones e inboxes depende de los
permisos del usuario dueño del token. El nodo no eleva privilegios ni oculta un `403`.

En create/update de definiciones, labels, agentes y equipos, el body se envía bajo
`custom_attribute_definition`, `label`, `agent` o `team`, respectivamente, como esperan los
controllers de Chatwoot. La traza opcional no muestra ese body porque puede contener datos del
workflow; sí muestra método y endpoint.

## Transparencia técnica

Cada operación muestra en el editor una línea **Under the Hood**. Si activas
**Output → Include API Details**, la salida agrega:

```json
{
	"_chatwootApi": {
		"calls": [
			{
				"method": "PATCH",
				"endpoint": "/api/v1/accounts/1/contacts/42"
			}
		]
	}
}
```

No se expone la Base URL, el token ni el secreto de webhook. Cuando una acción segura requiere
lectura previa —merge de atributos o labels— aparecen todas las llamadas en orden.

## Respuestas

- **Simplified**: desenvuelve `payload` y `data.payload`; una lista produce un item de n8n por
  entidad.
- **Raw Chatwoot Response**: conserva el body original. En paginación o acciones compuestas,
  conserva cada página/respuesta dentro de un objeto técnico.
- **Continue On Fail**: devuelve el error como item y permite continuar el workflow.

Las eliminaciones y el merge de contactos requieren activar una confirmación visible. Esto evita
que una expresión incompleta dispare por accidente una operación irreversible.
