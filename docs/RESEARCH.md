# Investigación y decisiones técnicas

Fecha de corte: 19 de agosto de 2026.

## Decisiones

### Autenticación

La API de aplicación de Chatwoot usa el token personal en el header `api_access_token`. Las rutas
de este paquete son:

```text
GET    /api/v1/accounts/:account_id/webhooks
POST   /api/v1/accounts/:account_id/webhooks
PATCH  /api/v1/accounts/:account_id/webhooks/:id
DELETE /api/v1/accounts/:account_id/webhooks/:id
```

En el código actual, `GET` responde dentro de `payload.webhooks`, mientras `POST` y `PATCH`
responden dentro de `payload.webhook`. Algunos ejemplos y versiones anteriores presentan el array
u objeto directamente. El cliente desenvuelve de forma explícita las dos variantes y rechaza una
forma desconocida, en vez de continuar con datos ambiguos.

El credential test usa el `GET`, que confirma al mismo tiempo Base URL, token, Account ID y acceso
a los webhooks. No se usa un Agent Bot token ni el token de un API Inbox: esos mecanismos tienen
otro propósito.

### Lifecycle e aislamiento

Se eligió **un webhook de Chatwoot por nodo trigger/workflow**. Compartir un webhook exigiría un
router externo o coordinación global entre workflows y haría más frágil la desactivación.

Cada webhook administrado tiene:

```text
name = n8n Chatwoot Trigger [primeros 16 caracteres de sha256(URL)]
url = URL de producción generada por n8n para ese nodo
subscriptions = [evento seleccionado]
```

En activación:

1. n8n llama `checkExists`.
2. Se consulta la lista de webhooks de la cuenta.
3. Si no existe esa URL, `create` crea uno.
4. Si existe con el nombre administrado y el mismo evento, se reutiliza.
5. Si es propio pero cambió el evento, se actualiza por ID.
6. Si la misma URL pertenece a un webhook ajeno/manual, se informa el conflicto y no se modifica.

En desactivación se vuelve a resolver el registro por URL y nombre. Solo entonces se elimina por
ID. El estado estático guarda ID, URL, nombre, evento y secreto como ayuda, pero no se usa a ciegas
para borrar. Así se evitan duplicados y daños a otros workflows.

Esta implementación sigue el lifecycle público de trigger nodes de n8n: `checkExists`, `create` y
`delete` dentro de `webhookMethods`.

### Nodo de acciones

La API y el código fuente de Chatwoot `4.17.0`, commit
`9486c5d795e916c51677cc7a32d1cf052770ffb9`, se revisaron de nuevo antes de implementar el nodo
**Chatwoot**. Se eligió un nodo programático porque varias operaciones intuitivas requieren más
de una llamada y no pueden expresarse de forma segura con routing declarativo simple:

- **Find Exact** filtra los resultados parciales de `/contacts/search`.
- **Create or Update** busca primero y decide entre `POST` y `PATCH`.
- **Add/Remove Labels** lee la lista actual porque el `POST /labels` reemplaza todo el conjunto.
- **Set Custom Attribute** carga la definición para convertir text, number, date, list o checkbox.
- En conversaciones, **Set Custom Attribute** lee el objeto actual y hace merge local antes del
  `POST`. Chatwoot 4.17.0 agregó `merge=true`; enviar también el objeto completo preserva datos en
  versiones anteriores que ignoran ese parámetro y reemplazan por defecto.
- Crear o actualizar definiciones, labels, agentes y equipos envuelve el body con la clave del
  recurso que esperan los controllers de Chatwoot. Esto también funciona en instalaciones donde
  Rails podría inferir ese envoltorio automáticamente.

El catálogo contiene 75 operaciones. Las entidades remotas con definición estable —inbox,
label, agente, equipo y atributo— se cargan mediante dropdowns. Los IDs de contacto,
conversación y mensaje quedan como campos con expresiones porque listar todas esas entidades para
cada apertura del editor sería caro e impráctico.

Cada operación muestra método y ruta. Opcionalmente la salida incluye la secuencia real en
`_chatwootApi.calls`. Esa traza contiene solo método y endpoint relativo; nunca Base URL, token ni
body sensible.

Las respuestas se desenvuelven de manera conservadora: `payload`, `data.payload`, arrays directos
y respuestas directas. El modo raw mantiene los bodies exactos; en paginación o acciones
compuestas los agrupa sin fingir una única respuesta de Chatwoot.

### Eventos y payloads reales

En Chatwoot 4.16.2 y 4.17.0, `Webhook::ALLOWED_WEBHOOK_EVENTS` incluye los diez eventos solicitados. El
listener construye los payloads de esta forma:

| Eventos | Forma relevante del payload |
| --- | --- |
| `conversation_created` | datos de la conversación y `event` |
| `conversation_status_changed`, `conversation_updated` | conversación, `event`, `changed_attributes` |
| `message_created`, `message_updated` | datos de mensaje y `event`; solo si el mensaje es `webhook_sendable?` |
| `webwidget_triggered` | datos de `contact_inbox`, `current_conversation`, `event_info`, `event` |
| `contact_created` | datos de contacto y `event` |
| `contact_updated` | contacto, `event`, `changed_attributes`; no se emite si no hay cambios |
| `conversation_typing_on`, `conversation_typing_off` | `user`, `conversation`, `is_private`, `event` |

Los eventos de conversación, mensaje, widget y escritura pueden enviarse al webhook de cuenta y,
en un API Inbox, también al webhook propio del canal. Este paquete crea únicamente webhooks de
cuenta.

La documentación pública de referencia de la API no siempre enumeró al mismo ritmo todos los
eventos que ya admitía el modelo. Por eso la lista se verificó contra el modelo, el listener y el
schema Swagger del mismo commit de Chatwoot, no solo contra una página descriptiva.

### Normalización

`normalizeWebhookPayload` es independiente del lifecycle. Devuelve siempre estas claves:

```text
event, account, inbox, conversation, contact, message, user,
changedAttributes, eventInfo, isPrivate, deliveryId, signatureVerified, raw
```

Los objetos ausentes son `null`. Para eventos cuyo modelo principal llega en el nivel superior,
se copia ese nivel sin `event` ni `changed_attributes`. No se convierten IDs, estados, fechas ni
valores. `raw` mantiene la referencia al objeto original recibido.

### Firma

El código actual de Chatwoot genera un secreto por webhook y envía:

```text
X-Chatwoot-Delivery: UUID
X-Chatwoot-Timestamp: epoch en segundos
X-Chatwoot-Signature: sha256=HMAC_SHA256(secret, timestamp + "." + rawBody)
```

El trigger verifica el HMAC con comparación de tiempo constante y rechaza timestamps con más de
cinco minutos de diferencia. Si una versión anterior no devuelve `secret`, el nodo no puede
autenticar criptográficamente esa entrega: la acepta y marca `signatureVerified: null`. El usuario
puede desactivar la verificación explícitamente, aunque no es lo recomendado.

### Duplicados

Chatwoot asigna un `X-Chatwoot-Delivery` a cada entrega. También existen reportes públicos de
múltiples `message_created` alrededor de ciertas acciones. No se añadió deduplicación global: un
evento repetido podría ser legítimo, y guardar IDs dentro del nodo sin una política de retención
introduciría pérdida de eventos o crecimiento de estado. `deliveryId` queda expuesto para que una
capa idempotente pueda agregarse después.

### Errores, timeout y logs

- Las llamadas administrativas tienen timeout de quince segundos.
- 401, 403, 404, 422, errores genéricos y timeout se convierten en mensajes en español con una
  sugerencia.
- Los mensajes de error se redactan para evitar que un `api_access_token` aparezca en n8n.
- Los logs incluyen acción, evento, URL administrada y delivery ID; nunca credenciales ni secreto.

## Riesgos y límites conocidos

1. **Las acciones todavía requieren smoke test con una cuenta real.** Los triggers ya fueron
   confirmados en una instalación real, pero mocks y build local no prueban permisos, canal ni
   configuración de cada acción.
2. **URL pública obligatoria.** Chatwoot no puede alcanzar `localhost`; además, SafeFetch bloquea
   redes privadas por defecto en instalaciones actuales.
3. **Compatibilidad histórica.** Instancias anteriores pueden no exponer el secreto o pueden
   rechazar eventos agregados después. El error de validación de Chatwoot queda visible al activar.
4. **Entrega asíncrona.** Una respuesta 2xx de n8n confirma recepción, no que los nodos posteriores
   terminaron exitosamente.
5. **Eventos de mensaje filtrados por Chatwoot.** El listener no envía mensajes que no cumplan
   `webhook_sendable?`; el nodo no puede recuperar eventos que Chatwoot decidió no emitir.

## Estructura exacta

```text
n8n-nodes-chatwoot-for-n8n/
├── credentials/
│   └── ChatwootApi.credentials.ts
├── nodes/Chatwoot/
│   ├── ChatwootTrigger.node.json
│   ├── ChatwootTrigger.node.ts
│   ├── Chatwoot.node.json
│   ├── Chatwoot.node.ts
│   ├── actions/
│   │   ├── execute.ts
│   │   ├── helpers.ts
│   │   ├── loadOptions.ts
│   │   ├── operations.ts
│   │   └── properties.ts
│   └── shared/
│       ├── api.ts
│       ├── errors.ts
│       ├── normalization.ts
│       ├── signature.ts
│       ├── types.ts
│       ├── url.ts
│       ├── webhookManager.ts
│       └── webhookResponse.ts
├── icons/
│   ├── ASSET-NOTICE.md
│   ├── chatwoot.dark.svg
│   └── chatwoot.svg
├── test/
│   ├── fixtures/webhookFixtures.ts
│   ├── actionCatalog.test.ts
│   ├── actionHelpers.test.ts
│   ├── actionLoadOptions.test.ts
│   ├── actionsExecute.test.ts
│   ├── api.test.ts
│   ├── errorsAndCredentials.test.ts
│   ├── normalization.test.ts
│   ├── signature.test.ts
│   ├── webhookManager.test.ts
│   └── webhookResponse.test.ts
├── docs/
│   ├── RESEARCH.md
│   ├── TESTING.md
│   ├── ACTIONS.md
│   └── VERIFICATION.md
├── CHANGELOG.md
├── LICENSE.md
├── README.md
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── tsconfig.json
├── tsconfig.test.json
└── vitest.config.mjs
```

## Fuentes oficiales revisadas

### Chatwoot

- [Guía oficial de webhooks y firma](https://www.chatwoot.com/hc/user-guide/articles/1677693021-how-to-use-webhooks)
- [API: crear un webhook](https://developers.chatwoot.com/api-reference/webhooks/add-a-webhook)
- [Modelo `Webhook` en el commit revisado](https://github.com/chatwoot/chatwoot/blob/1780e8f7017737b41be579c6f4d17365f7392bbe/app/models/webhook.rb)
- [Controller de la API](https://github.com/chatwoot/chatwoot/blob/1780e8f7017737b41be579c6f4d17365f7392bbe/app/controllers/api/v1/accounts/webhooks_controller.rb)
- [Serializador de cada webhook](https://github.com/chatwoot/chatwoot/blob/1780e8f7017737b41be579c6f4d17365f7392bbe/app/views/api/v1/accounts/webhooks/_webhook.json.jbuilder)
- [Envelope de la respuesta de listado](https://github.com/chatwoot/chatwoot/blob/1780e8f7017737b41be579c6f4d17365f7392bbe/app/views/api/v1/accounts/webhooks/index.json.jbuilder)
- [Listener que forma cada payload](https://github.com/chatwoot/chatwoot/blob/1780e8f7017737b41be579c6f4d17365f7392bbe/app/listeners/webhook_listener.rb)
- [Implementación de entrega y HMAC](https://github.com/chatwoot/chatwoot/blob/1780e8f7017737b41be579c6f4d17365f7392bbe/lib/webhooks/trigger.rb)
- [Schema Swagger del webhook](https://github.com/chatwoot/chatwoot/blob/1780e8f7017737b41be579c6f4d17365f7392bbe/swagger/definitions/resource/webhook.yml)
- [Reporte público de entregas duplicadas](https://github.com/chatwoot/chatwoot/issues/11901)
- [API oficial: contactos](https://developers.chatwoot.com/api-reference/contacts/list-contacts)
- [API oficial: conversaciones](https://developers.chatwoot.com/api-reference/conversations/conversations-list)
- [API oficial: mensajes](https://developers.chatwoot.com/api-reference/messages/create-new-message)
- [API oficial: atributos personalizados](https://developers.chatwoot.com/api-reference/custom-attributes/list-all-custom-attributes-in-an-account)
- [Controller de contactos 4.17.0](https://github.com/chatwoot/chatwoot/blob/9486c5d795e916c51677cc7a32d1cf052770ffb9/app/controllers/api/v1/accounts/contacts_controller.rb)
- [Controller de conversaciones 4.17.0](https://github.com/chatwoot/chatwoot/blob/9486c5d795e916c51677cc7a32d1cf052770ffb9/app/controllers/api/v1/accounts/conversations_controller.rb)
- [Merge compatible de atributos de conversación](https://github.com/chatwoot/chatwoot/blob/9486c5d795e916c51677cc7a32d1cf052770ffb9/app/controllers/concerns/conversation_custom_attributes_concern.rb)
- [Semántica de reemplazo de labels](https://github.com/chatwoot/chatwoot/blob/9486c5d795e916c51677cc7a32d1cf052770ffb9/app/controllers/concerns/label_concern.rb)

### n8n

- [Starter oficial de community nodes](https://github.com/n8n-io/n8n-nodes-starter/tree/3308a8eca314e388c40b29c9b6cefc49a8cf9115)
- [Documentación oficial para crear nodos](https://docs.n8n.io/integrations/creating-nodes/)
- [Código del GitHub Trigger oficial](https://github.com/n8n-io/n8n/blob/8c6d469c1982c4322ee5496a481db6543aec8c9e/packages/nodes-base/nodes/Github/GithubTrigger.node.ts)
- [Documentación de credenciales](https://docs.n8n.io/integrations/creating-nodes/build/reference/credentials-files/)
- [Documentación de trigger nodes](https://docs.n8n.io/integrations/creating-nodes/build/reference/trigger-node/)

Los commits se fijaron para que la investigación sea reproducible aunque cambien las ramas
principales.
