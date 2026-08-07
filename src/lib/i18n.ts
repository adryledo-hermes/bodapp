/**
 * Lightweight, dependency-free ES/EN localization for Bodapp (Task 13).
 *
 * This module is intentionally PURE — no React / Next / cookies imports — so it
 * is unit-testable and safe to import from both server and client components.
 *
 * - `messages`  : flat `key -> string` dictionary for es and en.
 * - `translate` : look up a message, falling back es -> key.
 * - `plural`    : pick the singular/plural form of a key by count.
 * - `normalizeLocale` / `getClientLocale`: safe locale coercion.
 *
 * The server-side cookie read lives in `src/lib/locale-server.ts` (it imports
 * `next/headers`, which must stay out of this file so client components can
 * safely import `translate` without dragging server-only code in).
 *
 * Key naming: namespaced by area, e.g. `nav.guests`, `seating.addTable`,
 * `task.status.todo`, `otp.sendCode`, `inv.confirmTitle`. Placeholders use
 * `{name}` and are filled by `translate(locale, key, { name: ... })`.
 */

export type Locale = "es" | "en";

/** The cookie that persists the couple's chosen panel language. */
export const LOCALE_COOKIE = "bodapp_locale";

export const LOCALES: readonly Locale[] = ["es", "en"] as const;

export const messages: Record<Locale, Record<string, string>> = {
  es: {
    // ---- Panel navigation ----
    "nav.guests": "Invitados",
    "nav.mesas": "Mesas",
    "nav.decoracion": "Decoración",
    "nav.tareas": "Tareas",
    "nav.invitacion": "Invitación",
    "nav.qr": "QR",
    "nav.fotos": "Fotos",

    // ---- Locale switcher ----
    "locale.switchTo": "Cambiar idioma",
    "locale.es": "ES",
    "locale.en": "EN",

    // ---- Common actions ----
    "common.cancel": "Cancelar",
    "common.save": "Guardar",
    "common.add": "Añadir",
    "common.saving": "Guardando…",
    "common.networkError": "Error de red: no se pudo guardar",

    // ---- Guests (personalized cards) ----
    "guest.searchPlaceholder": "Buscar por nombre o apodo…",
    "guest.searchAria": "Buscar invitados",
    "guest.rsvpFilterAria": "Filtrar por estado RSVP",
    "guest.allStatuses": "Todos los estados",
    "guest.status.pending": "Pendiente",
    "guest.status.confirmed": "Confirmado",
    "guest.status.declined": "Declinó",
    "guest.status.maybe": "Quizás",
    "guest.allergyPlaceholder": "Filtrar por alergia…",
    "guest.allergyAria": "Filtrar por alergia",
    "guest.empty": "No hay invitados que coincidan con la búsqueda.",
    "guest.tapMore": " — ver más",
    "guest.tapBack": " — volver",
    "guest.count.one": "invitado",
    "guest.count.other": "invitados",
    "guest.flipHint": "tap para ver más ↗",
    "guest.plusOne": "Acompañante:",
    "guest.plusOneYes": "sí",
    "guest.noPlusOne": "Sin acompañante",
    "guest.back": "volver ↺",

    // ---- Seating canvas ----
    "seating.addTable": "+ Añadir mesa",
    "seating.nameLabel": "Nombre",
    "seating.capacityLabel": "Capacidad",
    "seating.shapeLabel": "Forma",
    "seating.shapeRound": "Redonda",
    "seating.shapeRectangle": "Rectangular",
    "seating.createTable": "Crear mesa",
    "seating.table.one": "mesa",
    "seating.table.other": "mesas",
    "seating.seated.one": "invitado sentado",
    "seating.seated.other": "invitados sentados",
    "seating.emptyAll":
      "Aún no hay mesas ni invitados. Crea una mesa para empezar a organizar el comedor.",
    "seating.emptyCanvas":
      "Sin mesas todavía. Crea la primera mesa con el botón superior.",
    "seating.tableNameAria": "Nombre de la mesa",
    "seating.toggleShapeTitle": "Cambiar forma",
    "seating.decreaseCapacityAria": "Reducir capacidad",
    "seating.increaseCapacityAria": "Aumentar capacidad",
    "seating.conflictLabel": "No se llevan bien:",
    "seating.dropGuest": "Suelta aquí un invitado",
    "seating.removeGuestAria": "Quitar a {name} de la mesa",
    "seating.deleteTableAria": "Eliminar mesa",
    "seating.unassigned": "Invitados sin asignar ({count})",
    "seating.allAssigned": "Todos los invitados tienen mesa.",
    "seating.errName": "Ponle un nombre a la mesa.",
    "seating.okCreated": "Mesa creada.",
    "seating.errAssign": "No se pudo asignar el invitado. Reintenta.",
    "seating.errRelease": "No se pudo liberar al invitado. Reintenta.",
    "seating.errCreate": "No se pudo crear la mesa.",
    "seating.errDelete": "No se pudo eliminar la mesa.",
    "seating.errPatch": "No se pudo guardar el cambio de la mesa.",

    // ---- Task board ----
    "task.mesas": "Mesas",
    "task.viewBoard": "🗂️ Tablero",
    "task.viewCalendar": "📅 Calendario",
    "task.addChecklist": "📋 Añadir checklist de boda",
    "task.loadingChecklist": "Cargando…",
    "task.addTask": "+ Añadir tarea",
    "task.titleLabel": "Título *",
    "task.titlePlaceholder": "Contratar florista…",
    "task.categoryLabel": "Categoría",
    "task.priorityLabel": "Prioridad",
    "task.dueDateLabel": "Fecha límite",
    "task.descriptionLabel": "Descripción",
    "task.statusLabel": "Estado",
    "task.createTask": "Crear tarea",
    "task.editBtn": "✏️ Editar",
    "task.deleteBtn": "🗑️ Eliminar",
    "task.emptyTitle": "🗂️ Sin tareas todavía",
    "task.emptyBody":
      "Carga la checklist de boda con un clic o añade tu primera tarea para empezar a organizarlo todo.",
    "task.loadChecklist": "📋 Cargar checklist de boda",
    "task.dropHere": "Suelta aquí una tarea",
    "task.noDate": "Sin fecha",
    "task.confirmDelete": "¿Eliminar esta tarea?",
    "task.confirmSeed":
      "Ya hay tareas. ¿Añadir la checklist de todas formas?",
    "task.errMove": "No se pudo cambiar el estado. Reintenta.",
    "task.errTitle": "Ponle un título a la tarea.",
    "task.errEmptyTitle": "El título no puede estar vacío.",
    "task.okCreated": "Tarea creada.",
    "task.errCreate": "No se pudo crear la tarea.",
    "task.errSave": "No se pudo guardar la tarea.",
    "task.okUpdated": "Tarea actualizada.",
    "task.errDelete": "No se pudo eliminar la tarea.",
    "task.errSeed": "No se pudo cargar la checklist.",
    "task.okSeedEmpty": "Ya tenías tareas: no se duplicó nada.",
    "task.okSeedLoaded": "Checklist cargada ({count} tareas).",
    "task.okSeedRefresh":
      "Checklist añadida; recarga la página si no ves las tareas",
    "task.status.todo": "Por hacer",
    "task.status.in_progress": "En curso",
    "task.status.done": "Hecho",
    "task.status.blocked": "Bloqueado",
    "task.priority.low": "Baja",
    "task.priority.medium": "Media",
    "task.priority.high": "Alta",
    "task.category.legal": "Trámites legales",
    "task.category.vendors": "Proveedores",
    "task.category.timing": "Timing del día",
    "task.category.gifts": "Regalos",

    // ---- Decorations ----
    "decor.tabMesas": "🍽️ Mesas",
    "decor.tabDecoracion": "🎀 Decoración",
    "decor.addDecoracion": "+ Añadir decoración",
    "decor.elements.one": "elemento",
    "decor.elements.other": "elementos",
    "decor.dragHint": "· arrastra para recolocar",
    "decor.typeLabel": "Tipo",
    "decor.kind.centerpiece": "Centro de mesa",
    "decor.kind.giftTable": "Mesa de regalos",
    "decor.kind.photoWall": "Photocall",
    "decor.kind.danceFloor": "Pista de baile",
    "decor.kind.other": "Otro",
    "decor.labelOptional": "Etiqueta (opcional)",
    "decor.labelPlaceholder": "Junto al bar",
    "decor.empty":
      "Aún no hay decoración. Añade centros de mesa, mesa de regalos, photocall o pista de baile con el botón superior.",
    "decor.dragTitle": "Arrastra para mover",
    "decor.deleteAria": "Eliminar {label}",
    "decor.errAdd": "No se pudo añadir el elemento.",
    "decor.okAdded": "Elemento añadido.",
    "decor.errDelete": "No se pudo eliminar el elemento.",
    "decor.errPos": "No se pudo guardar la posición.",

    // ---- Invitation template editor ----
    "tpl.editTitle": "Edita la invitación",
    "tpl.version": "Versión {n}",
    "tpl.titleA": "Nombre del contrayente A",
    "tpl.titleB": "Nombre del contrayente B",
    "tpl.messageLabel": "Mensaje",
    "tpl.dateLabel": "Fecha",
    "tpl.timeLabel": "Hora",
    "tpl.venueLabel": "Lugar / Venue",
    "tpl.dressCodeLabel": "Código de vestimenta",
    "tpl.colorsLabel": "Colores",
    "tpl.primaryLabel": "Primario",
    "tpl.accentLabel": "Acento",
    "tpl.bankLabel": "Cuenta bancaria (IBAN) para regalos",
    "tpl.bankHelp":
      "Aparecerá en el apartado \"Transferencia bancaria\" de la invitación pública.",
    "tpl.preview": "Vista previa",
    "tpl.namesFallback": "Vuestros nombres",
    "tpl.ourWedding": "Nuestra boda",
    "tpl.bankTransfer": "🎁 Transferencia bancaria",
    "tpl.savePublish": "Guardar y publicar",
    "tpl.errFields": "Revisa los campos del formulario.",
    "tpl.errSave": "No se ha podido guardar. Vuelve a intentarlo.",
    "tpl.okSaved": "Invitación guardada y publicada (versión {n}).",
    "tpl.errGeneric": "Error al guardar.",

    // ---- QR panel ----
    "qr.empty":
      "Todavía no hay invitaciones. Crea una invitación para poder generar sus códigos QR.",
    "qr.alt": "Código QR de {title}",
    "qr.download": "Descargar QR",
    "qr.fileName": "invitacion-qr-{id}.png",

    // ---- Photo gallery ----
    "photo.uploading": "Subiendo…",
    "photo.upload": "Subir foto",
    "photo.sizeHint": "PNG, JPG, WEBP o GIF · máx. 10 MB",
    "photo.errUpload": "No se pudo subir la foto",
    "photo.errDelete": "No se pudo eliminar la foto",
    "photo.empty":
      "Todavía no hay fotos. Sube las primeras fotos de la pareja para mostrarlas en la galería.",
    "photo.alt": "Foto de la pareja",
    "photo.deleting": "Eliminando…",
    "photo.delete": "Eliminar",

    // ---- Panel page headers ----
    "p.guests.title": "Invitados",
    "p.guests.subtitle":
      "{count} invitado{plural} — toca una carta para ver los detalles",
    "p.tareas.title": "Tareas",
    "p.tareas.subtitle":
      "Organiza las tareas de la boda en un tablero Kanban. Arrastra cada tarjeta entre columnas para cambiar su estado, añade tus propias tareas o carga la checklist de boda con un clic.",
    "p.mesas.title": "Mesas",
    "p.mesas.subtitle":
      "Arrastra los invitados a las mesas. Se avisa si una mesa se llena o si dos personas que no se llevan bien comparten mesa.",
    "p.decoracion.title": "Decoración",
    "p.decoracion.subtitle":
      "Coloca los espacios de decoración y regalos sobre el plano del comedor: centros de mesa, mesa de regalos, photocall o pista de baile. Cambia a \"Mesas\" para organizar los invitados.",
    "p.invitacion.title": "Invitación",
    "p.invitacion.subtitle":
      "Personaliza el texto y los colores de vuestra invitación y añade vuestra cuenta bancaria para los regalos. Cada vez que publiques se creará una nueva versión de la plantilla.",
    "p.qr.title": "Códigos QR",
    "p.qr.subtitle":
      "Genera un código QR por invitación. Al escanearlo, los invitados llegarán a la página de entrada con su teléfono.",
    "p.fotos.title": "Fotos",
    "p.fotos.subtitle":
      "Sube las fotos de la pareja (compromiso, boda…) para mostrarlas en la galería.",

    // ---- OTP public flow ----
    "otp.yourPhone": "Tu teléfono",
    "otp.sending": "Enviando...",
    "otp.sendCode": "Enviar código",
    "otp.sentMsg": "Te hemos enviado un código de 6 dígitos por SMS.",
    "otp.codeLabel": "Código",
    "otp.verifying": "Verificando...",
    "otp.verify": "Verificar",
    "otp.changePhone": "Cambiar teléfono",
    "otp.errSend": "No se pudo enviar el código. Inténtalo de nuevo.",
    "otp.errNetwork": "Error de red. Inténtalo de nuevo.",
    "otp.errCode": "Código incorrecto. Vuelve a intentarlo.",

    // ---- Public invitation page ----
    "inv.invitation": "Invitación",
    "inv.ours": "Nuestra boda",
    "inv.bodappTag": "Bodapp · Invitación",
    "inv.dateLabel": "Fecha",
    "inv.timeLabel": "Hora",
    "inv.venueLabel": "Lugar",
    "inv.dressCodeLabel": "Código de vestimenta",
    "inv.bankTransfer": "🎁 Transferencia bancaria",
    "inv.bankHelp":
      "Si prefieres hacernos un regalo en metálico, puedes transferirlo a esta cuenta. ¡Gracias!",
    "inv.yourPlusOne": "Tu acompañante:",
    "inv.confirmTitle": "Confirma tu asistencia",
    "inv.currentResponse": "Respuesta actual:",
    "inv.optConfirmed": "✅ Confirmo asistencia",
    "inv.optDeclined": "❌ No podré asistir",
    "inv.optMaybe": "🤔 Quizás",
    "inv.allergiesLabel": "Alergias o intolerancias",
    "inv.allergiesPlaceholder":
      "p. ej. gluten, frutos secos (separadas por comas)",
    "inv.musicLabel": "Cómo nos acompañarías en la pista",
    "inv.musicPlaceholder": "p. ej. rock, funky (separados por comas)",
    "inv.saving": "Guardando...",
    "inv.saveResponse": "Guardar mi respuesta",
    "inv.pendingHint": "Elige una opción para poder guardar tu respuesta.",
    "inv.errSave": "No se pudo guardar tu respuesta. Inténtalo de nuevo.",
    "inv.okSaved": "¡Gracias! Hemos guardado tu respuesta.",
    "inv.errNetwork": "Error de red. No se pudo guardar tu respuesta.",
    "inv.youHaveAccess": "Tienes acceso a tu invitación",
    "inv.accessSoon":
      "En breve podrás ver los detalles y confirmar tu asistencia.",
    "inv.viewInvitation": "Ver mi invitación",
    "inv.otpIntro":
      "Para ver tu invitación, confirma tu número de teléfono para recibir un código por SMS.",

    // ---- Login ----
    "login.access": "Acceso de la pareja",
    "login.email": "Email",
    "login.password": "Contraseña",
    "login.entering": "Entrando...",
    "login.enter": "Entrar",
    "login.err": "Error iniciando sesión",
    "login.errNetwork": "Error de red",
  },

  en: {
    // ---- Panel navigation ----
    "nav.guests": "Guests",
    "nav.mesas": "Tables",
    "nav.decoracion": "Decorations",
    "nav.tareas": "Tasks",
    "nav.invitacion": "Invitation",
    "nav.qr": "QR",
    "nav.fotos": "Photos",

    // ---- Locale switcher ----
    "locale.switchTo": "Switch language",
    "locale.es": "ES",
    "locale.en": "EN",

    // ---- Common actions ----
    "common.cancel": "Cancel",
    "common.save": "Save",
    "common.add": "Add",
    "common.saving": "Saving…",
    "common.networkError": "Network error: could not save",

    // ---- Guests ----
    "guest.searchPlaceholder": "Search by name or nickname…",
    "guest.searchAria": "Search guests",
    "guest.rsvpFilterAria": "Filter by RSVP status",
    "guest.allStatuses": "All statuses",
    "guest.status.pending": "Pending",
    "guest.status.confirmed": "Confirmed",
    "guest.status.declined": "Declined",
    "guest.status.maybe": "Maybe",
    "guest.allergyPlaceholder": "Filter by allergy…",
    "guest.allergyAria": "Filter by allergy",
    "guest.empty": "No guests match your search.",
    "guest.tapMore": " — see more",
    "guest.tapBack": " — back",
    "guest.count.one": "guest",
    "guest.count.other": "guests",
    "guest.flipHint": "tap to see more ↗",
    "guest.plusOne": "Plus one:",
    "guest.plusOneYes": "yes",
    "guest.noPlusOne": "No plus one",
    "guest.back": "back ↺",

    // ---- Seating canvas ----
    "seating.addTable": "+ Add table",
    "seating.nameLabel": "Name",
    "seating.capacityLabel": "Capacity",
    "seating.shapeLabel": "Shape",
    "seating.shapeRound": "Round",
    "seating.shapeRectangle": "Rectangle",
    "seating.createTable": "Create table",
    "seating.table.one": "table",
    "seating.table.other": "tables",
    "seating.seated.one": "guest seated",
    "seating.seated.other": "guests seated",
    "seating.emptyAll":
      "No tables or guests yet. Create a table to start planning the dining room.",
    "seating.emptyCanvas":
      "No tables yet. Create the first table with the button above.",
    "seating.tableNameAria": "Table name",
    "seating.toggleShapeTitle": "Change shape",
    "seating.decreaseCapacityAria": "Decrease capacity",
    "seating.increaseCapacityAria": "Increase capacity",
    "seating.conflictLabel": "Don't get along:",
    "seating.dropGuest": "Drop a guest here",
    "seating.removeGuestAria": "Remove {name} from table",
    "seating.deleteTableAria": "Delete table",
    "seating.unassigned": "Unassigned guests ({count})",
    "seating.allAssigned": "All guests have a table.",
    "seating.errName": "Give the table a name.",
    "seating.okCreated": "Table created.",
    "seating.errAssign": "Could not assign the guest. Try again.",
    "seating.errRelease": "Could not release the guest. Try again.",
    "seating.errCreate": "Could not create the table.",
    "seating.errDelete": "Could not delete the table.",
    "seating.errPatch": "Could not save the table change.",

    // ---- Task board ----
    "task.mesas": "Tables",
    "task.viewBoard": "🗂️ Board",
    "task.viewCalendar": "📅 Calendar",
    "task.addChecklist": "📋 Add wedding checklist",
    "task.loadingChecklist": "Loading…",
    "task.addTask": "+ Add task",
    "task.titleLabel": "Title *",
    "task.titlePlaceholder": "Hire a florist…",
    "task.categoryLabel": "Category",
    "task.priorityLabel": "Priority",
    "task.dueDateLabel": "Due date",
    "task.descriptionLabel": "Description",
    "task.statusLabel": "Status",
    "task.createTask": "Create task",
    "task.editBtn": "✏️ Edit",
    "task.deleteBtn": "🗑️ Delete",
    "task.emptyTitle": "🗂️ No tasks yet",
    "task.emptyBody":
      "Load the wedding checklist with one click or add your first task to start organising everything.",
    "task.loadChecklist": "📋 Load wedding checklist",
    "task.dropHere": "Drop a task here",
    "task.noDate": "No date",
    "task.confirmDelete": "Delete this task?",
    "task.confirmSeed": "You already have tasks. Add the checklist anyway?",
    "task.errMove": "Could not change the status. Try again.",
    "task.errTitle": "Give the task a title.",
    "task.errEmptyTitle": "The title cannot be empty.",
    "task.okCreated": "Task created.",
    "task.errCreate": "Could not create the task.",
    "task.errSave": "Could not save the task.",
    "task.okUpdated": "Task updated.",
    "task.errDelete": "Could not delete the task.",
    "task.errSeed": "Could not load the checklist.",
    "task.okSeedEmpty": "You already had tasks: nothing was duplicated.",
    "task.okSeedLoaded": "Checklist loaded ({count} tasks).",
    "task.okSeedRefresh":
      "Checklist added; reload the page if you don't see the tasks",
    "task.status.todo": "To do",
    "task.status.in_progress": "In progress",
    "task.status.done": "Done",
    "task.status.blocked": "Blocked",
    "task.priority.low": "Low",
    "task.priority.medium": "Medium",
    "task.priority.high": "High",
    "task.category.legal": "Legal",
    "task.category.vendors": "Vendors",
    "task.category.timing": "Day schedule",
    "task.category.gifts": "Gifts",

    // ---- Decorations ----
    "decor.tabMesas": "🍽️ Tables",
    "decor.tabDecoracion": "🎀 Decorations",
    "decor.addDecoracion": "+ Add decoration",
    "decor.elements.one": "item",
    "decor.elements.other": "items",
    "decor.dragHint": "· drag to rearrange",
    "decor.typeLabel": "Type",
    "decor.kind.centerpiece": "Centerpiece",
    "decor.kind.giftTable": "Gift table",
    "decor.kind.photoWall": "Photo wall",
    "decor.kind.danceFloor": "Dance floor",
    "decor.kind.other": "Other",
    "decor.labelOptional": "Label (optional)",
    "decor.labelPlaceholder": "Near the bar",
    "decor.empty":
      "No decorations yet. Add centerpieces, a gift table, a photo wall or a dance floor with the button above.",
    "decor.dragTitle": "Drag to move",
    "decor.deleteAria": "Delete {label}",
    "decor.errAdd": "Could not add the item.",
    "decor.okAdded": "Item added.",
    "decor.errDelete": "Could not delete the item.",
    "decor.errPos": "Could not save the position.",

    // ---- Invitation template editor ----
    "tpl.editTitle": "Edit the invitation",
    "tpl.version": "Version {n}",
    "tpl.titleA": "Party member A name",
    "tpl.titleB": "Party member B name",
    "tpl.messageLabel": "Message",
    "tpl.dateLabel": "Date",
    "tpl.timeLabel": "Time",
    "tpl.venueLabel": "Venue",
    "tpl.dressCodeLabel": "Dress code",
    "tpl.colorsLabel": "Colors",
    "tpl.primaryLabel": "Primary",
    "tpl.accentLabel": "Accent",
    "tpl.bankLabel": "Bank account (IBAN) for gifts",
    "tpl.bankHelp":
      "It will appear in the \"Bank transfer\" section of the public invitation.",
    "tpl.preview": "Preview",
    "tpl.namesFallback": "Your names",
    "tpl.ourWedding": "Our wedding",
    "tpl.bankTransfer": "🎁 Bank transfer",
    "tpl.savePublish": "Save and publish",
    "tpl.errFields": "Check the form fields.",
    "tpl.errSave": "Could not save. Please try again.",
    "tpl.okSaved": "Invitation saved and published (version {n}).",
    "tpl.errGeneric": "Error saving.",

    // ---- QR panel ----
    "qr.empty":
      "No invitations yet. Create an invitation to generate its QR codes.",
    "qr.alt": "QR code for {title}",
    "qr.download": "Download QR",
    "qr.fileName": "invitation-qr-{id}.png",

    // ---- Photo gallery ----
    "photo.uploading": "Uploading…",
    "photo.upload": "Upload photo",
    "photo.sizeHint": "PNG, JPG, WEBP or GIF · max 10 MB",
    "photo.errUpload": "Could not upload the photo",
    "photo.errDelete": "Could not delete the photo",
    "photo.empty":
      "No photos yet. Upload the couple's first photos to show them in the gallery.",
    "photo.alt": "Couple photo",
    "photo.deleting": "Deleting…",
    "photo.delete": "Delete",

    // ---- Panel page headers ----
    "p.guests.title": "Guests",
    "p.guests.subtitle":
      "{count} guest{plural} — tap a card to see the details",
    "p.tareas.title": "Tasks",
    "p.tareas.subtitle":
      "Organise the wedding tasks on a Kanban board. Drag each card between columns to change its status, add your own tasks or load the wedding checklist with one click.",
    "p.mesas.title": "Tables",
    "p.mesas.subtitle":
      "Drag guests to the tables. You'll be warned if a table fills up or if two people who don't get along share a table.",
    "p.decoracion.title": "Decorations",
    "p.decoracion.subtitle":
      "Place the decoration and gifts areas on the dining room floor plan: centerpieces, gift table, photo wall or dance floor. Switch to \"Tables\" to organise the guests.",
    "p.invitacion.title": "Invitation",
    "p.invitacion.subtitle":
      "Customise the text and colours of your invitation and add your bank account for gifts. Each time you publish, a new template version is created.",
    "p.qr.title": "QR codes",
    "p.qr.subtitle":
      "Generate a QR code per invitation. On scanning it, guests will reach the entry page with their phone.",
    "p.fotos.title": "Photos",
    "p.fotos.subtitle":
      "Upload the couple's photos (engagement, wedding…) to show them in the gallery.",

    // ---- OTP public flow ----
    "otp.yourPhone": "Your phone",
    "otp.sending": "Sending...",
    "otp.sendCode": "Send code",
    "otp.sentMsg": "We've sent you a 6-digit code by SMS.",
    "otp.codeLabel": "Code",
    "otp.verifying": "Verifying...",
    "otp.verify": "Verify",
    "otp.changePhone": "Change phone",
    "otp.errSend": "Could not send the code. Try again.",
    "otp.errNetwork": "Network error. Try again.",
    "otp.errCode": "Incorrect code. Try again.",

    // ---- Public invitation page ----
    "inv.invitation": "Invitation",
    "inv.ours": "Our wedding",
    "inv.bodappTag": "Bodapp · Invitation",
    "inv.dateLabel": "Date",
    "inv.timeLabel": "Time",
    "inv.venueLabel": "Venue",
    "inv.dressCodeLabel": "Dress code",
    "inv.bankTransfer": "🎁 Bank transfer",
    "inv.bankHelp":
      "If you'd prefer to give us a cash gift, you can transfer it to this account. Thank you!",
    "inv.yourPlusOne": "Your plus one:",
    "inv.confirmTitle": "Confirm your attendance",
    "inv.currentResponse": "Current response:",
    "inv.optConfirmed": "✅ I'll attend",
    "inv.optDeclined": "❌ I can't attend",
    "inv.optMaybe": "🤔 Maybe",
    "inv.allergiesLabel": "Allergies or intolerances",
    "inv.allergiesPlaceholder":
      "e.g. gluten, nuts (comma separated)",
    "inv.musicLabel": "How you'd join us on the dance floor",
    "inv.musicPlaceholder": "e.g. rock, funk (comma separated)",
    "inv.saving": "Saving...",
    "inv.saveResponse": "Save my response",
    "inv.pendingHint": "Choose an option to save your response.",
    "inv.errSave": "Could not save your response. Try again.",
    "inv.okSaved": "Thank you! We've saved your response.",
    "inv.errNetwork": "Network error. Could not save your response.",
    "inv.youHaveAccess": "You have access to your invitation",
    "inv.accessSoon":
      "You'll soon be able to see the details and confirm your attendance.",
    "inv.viewInvitation": "View my invitation",
    "inv.otpIntro":
      "To view your invitation, confirm your phone number to receive an SMS code.",

    // ---- Login ----
    "login.access": "Couple access",
    "login.email": "Email",
    "login.password": "Password",
    "login.entering": "Signing in...",
    "login.enter": "Sign in",
    "login.err": "Error signing in",
    "login.errNetwork": "Network error",
  },
};

/** Coerce any value into a safe Locale, honouring an explicit fallback. */
export function normalizeLocale(
  value: string | null | undefined,
  fallback: Locale = "es"
): Locale {
  if (value === "en") return "en";
  if (value === "es") return "es";
  return fallback === "en" ? "en" : "es";
}

/**
 * Look up a localized message. Unknown keys fall back to the Spanish table and
 * then to the key itself, so a missing translation never crashes the UI.
 */
export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>
): string {
  const table = messages[normalizeLocale(locale, "es")] ?? messages.es;
  let str = table[key] ?? messages.es[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.split(`{${k}}`).join(String(v));
    }
  }
  return str;
}

/** Short alias for `translate`, handy in JSX-heavy components. */
export const t = translate;

/**
 * Pick the singular/plural form for `key` based on `count`. The dictionary
 * holds the two forms under `<key>.one` and `<key>.other` (a 1 vs everything
 * else split, which covers English and Spanish pluralisation).
 */
export function plural(locale: Locale, key: string, count: number): string {
  return translate(locale, count === 1 ? `${key}.one` : `${key}.other`);
}

/**
/** Read the locale from the browser cookie (client-side only). Falls back to
 * `fallback` when there's no cookie or we're not in a browser context.
 */
export function getClientLocale(fallback: Locale = "es"): Locale {
  if (typeof document === "undefined") return fallback;
  const cookie = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${LOCALE_COOKIE}=`));
  const value = cookie?.slice(LOCALE_COOKIE.length + 1);
  return normalizeLocale(value ?? undefined, fallback);
}

/** Persist the chosen locale to the browser cookie (client-side only). */
export function setClientLocale(next: Locale): void {
  if (typeof document === "undefined") return;
  document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
}
