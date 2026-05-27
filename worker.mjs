let token;
let apiBase;

const sessions = new Map();

const services = [
  { id: "manicure", title: "Маникюр", duration: "1 ч 30 мин", price: "от 1 500 ₽" },
  { id: "pedicure", title: "Педикюр", duration: "1 ч 40 мин", price: "от 1 800 ₽" },
  { id: "brows", title: "Брови / ресницы", duration: "1 ч", price: "от 1 200 ₽" },
  { id: "hair", title: "Окрашивание", duration: "2 ч 30 мин", price: "от 3 500 ₽" }
];

const timeSlots = ["10:00", "12:00", "14:30", "16:00", "18:30"];

function inline(buttons) {
  return { inline_keyboard: buttons };
}

function mainMenu() {
  return inline([
    [{ text: "Посмотреть примеры работ", callback_data: "examples" }],
    [{ text: "Записаться", callback_data: "book" }],
    [{ text: "Моя запись", callback_data: "my_appointments" }],
    [{ text: "Цены и услуги", callback_data: "prices" }]
  ]);
}

function contactKeyboard() {
  return {
    keyboard: [[{ text: "Поделиться номером", request_contact: true }], ["Моя запись"]],
    resize_keyboard: true,
    one_time_keyboard: true
  };
}

function removeKeyboard() {
  return { remove_keyboard: true };
}

function serviceMenu() {
  return inline([
    ...services.map((service) => [
      { text: `${service.title} · ${service.duration}`, callback_data: `service:${service.id}` }
    ]),
    [{ text: "Назад", callback_data: "home" }]
  ]);
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function isoDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function freeDates() {
  const dates = [];
  const today = new Date();

  for (let offset = 1; dates.length < 5; offset += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);

    if (date.getDay() !== 0) {
      dates.push(isoDate(date));
    }
  }

  return dates;
}

function dateMenu() {
  return inline([
    ...freeDates().map((date) => [{ text: formatDate(date), callback_data: `date:${date}` }]),
    [{ text: "Назад к услугам", callback_data: "book" }]
  ]);
}

function timeMenu() {
  return inline([
    ...timeSlots.map((slot) => [{ text: slot, callback_data: `time:${slot}` }]),
    [{ text: "Назад к датам", callback_data: "dates" }]
  ]);
}

function formatDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0);

  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "2-digit",
    month: "long"
  }).format(date);
}

function session(chatId) {
  const key = String(chatId);

  if (!sessions.has(key)) {
    sessions.set(key, {});
  }

  return sessions.get(key);
}

function resetSession(chatId) {
  const key = String(chatId);
  sessions.set(key, {});
  return sessions.get(key);
}

function selectedService(data) {
  return services.find((service) => service.id === data.serviceId);
}

function appointmentId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

async function tg(method, payload) {
  const response = await fetch(`${apiBase}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!data.ok) {
    throw new Error(`${method}: ${data.description}`);
  }

  return data.result;
}

async function send(chatId, text, options = {}) {
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: false,
    ...options
  });
}

async function answer(id) {
  return tg("answerCallbackQuery", {
    callback_query_id: id
  });
}

async function readAppointments(env) {
  const raw = await env.APPOINTMENTS.get("items");
  return raw ? JSON.parse(raw) : [];
}

async function writeAppointments(env, items) {
  await env.APPOINTMENTS.put("items", JSON.stringify(items, null, 2));
}

async function activeAppointments(env, chatId) {
  const items = await readAppointments(env);
  return items.filter((item) => item.chatId === chatId && item.status === "active");
}

function appointmentText(item) {
  return [
    `Услуга: ${item.service}`,
    `Дата и время: ${formatDate(item.date)}, ${item.time}`,
    `Имя: ${item.name}`,
    `Телефон: ${item.phone}`
  ].join("\n");
}

async function home(chatId) {
  resetSession(chatId);

  await send(
    chatId,
    [
      "Здравствуйте! Это демо-бот салона красоты.",
      "",
      "Здесь клиент может посмотреть работы, выбрать услугу, дату, время и оставить номер для подтверждения.",
      "",
      "Кнопка «Моя запись» показывает активную запись и позволяет отменить ее с указанием причины."
    ].join("\n"),
    { reply_markup: mainMenu() }
  );
}

async function examples(chatId) {
  await send(
    chatId,
    [
      "Примеры работ:",
      "",
      "1. Маникюр: чистое покрытие, укрепление, дизайн",
      "2. Брови: оформление, окрашивание, ламинирование",
      "3. Волосы: окрашивание, уход, укладка",
      "",
      "В реальном боте сюда можно добавить фото работ, мастеров и ссылки на портфолио."
    ].join("\n"),
    {
      reply_markup: inline([
        [{ text: "Хочу записаться", callback_data: "book" }],
        [{ text: "Назад", callback_data: "home" }]
      ])
    }
  );
}

async function prices(chatId) {
  await send(
    chatId,
    [
      "Демо-услуги:",
      "",
      ...services.map((item) => `${item.title}: ${item.price}`)
    ].join("\n"),
    {
      reply_markup: inline([
        [{ text: "Записаться", callback_data: "book" }],
        [{ text: "Назад", callback_data: "home" }]
      ])
    }
  );
}

async function showMine(env, chatId) {
  resetSession(chatId);

  const items = await activeAppointments(env, chatId);

  if (items.length === 0) {
    await send(chatId, "У вас пока нет активной записи.", {
      reply_markup: inline([
        [{ text: "Записаться", callback_data: "book" }],
        [{ text: "Назад", callback_data: "home" }]
      ])
    });

    return;
  }

  await send(
    chatId,
    [
      "Ваша активная запись:",
      "",
      ...items.map((item, index) => `${index + 1}. ${appointmentText(item)}`)
    ].join("\n\n"),
    {
      reply_markup: inline([
        ...items.map((item) => [
          {
            text: `Отменить: ${formatDate(item.date)}, ${item.time}`,
            callback_data: `cancel:${item.id}`
          }
        ]),
        [{ text: "Назад", callback_data: "home" }]
      ])
    }
  );
}

async function book(chatId) {
  const data = resetSession(chatId);
  data.step = "service";

  await send(chatId, "Выберите услугу:", {
    reply_markup: serviceMenu()
  });
}

async function chooseService(chatId, serviceId) {
  const data = session(chatId);
  data.step = "date";
  data.serviceId = serviceId;

  const service = selectedService(data);

  await send(chatId, `Вы выбрали: ${service.title}.\nТеперь выберите свободную дату:`, {
    reply_markup: dateMenu()
  });
}

async function chooseDate(chatId, date) {
  const data = session(chatId);
  data.step = "time";
  data.date = date;

  await send(chatId, `Дата: ${formatDate(date)}.\nВыберите свободное время:`, {
    reply_markup: timeMenu()
  });
}

async function chooseTime(chatId, time) {
  const data = session(chatId);
  data.step = "name";
  data.time = time;

  const service = selectedService(data);

  await send(
    chatId,
    [
      "Почти готово.",
      "",
      `Услуга: ${service.title}`,
      `Дата: ${formatDate(data.date)}`,
      `Время: ${time}`,
      "",
      "Как к вам обращаться?"
    ].join("\n")
  );
}

async function receiveName(chatId, name) {
  const data = session(chatId);
  data.step = "phone";
  data.name = name.trim();

  await send(chatId, `${data.name}, оставьте номер телефона для подтверждения записи.`, {
    reply_markup: contactKeyboard()
  });
}

async function receiveContact(env, chatId, contact) {
  const data = session(chatId);
  const service = selectedService(data);

  if (!service || !data.date || !data.time || !data.name) {
    await send(chatId, "Давайте начнем запись заново.", {
      reply_markup: removeKeyboard()
    });

    await book(chatId);
    return;
  }

  const item = {
    id: appointmentId(),
    chatId,
    name: data.name,
    phone: contact.phone_number,
    telegramUserId: contact.user_id ?? null,
    service: service.title,
    date: data.date,
    time: data.time,
    status: "active",
    createdAt: new Date().toISOString()
  };

  const items = await readAppointments(env);
  items.push(item);
  await writeAppointments(env, items);

  resetSession(chatId);

  await send(chatId, ["Запись принята!", "", appointmentText(item)].join("\n"), {
    reply_markup: removeKeyboard()
  });

  await send(chatId, "Теперь запись можно посмотреть или отменить через кнопку «Моя запись».", {
    reply_markup: mainMenu()
  });
}

async function askCancelReason(env, chatId, id) {
  const items = await activeAppointments(env, chatId);
  const item = items.find((entry) => entry.id === id);

  if (!item) {
    await send(chatId, "Эта запись уже не активна или не найдена.", {
      reply_markup: mainMenu()
    });

    return;
  }

  const data = resetSession(chatId);
  data.step = "cancel_reason";
  data.cancelAppointmentId = id;

  await send(
    chatId,
    [
      "Хорошо, отменим запись.",
      "",
      appointmentText(item),
      "",
      "Напишите причину отмены:"
    ].join("\n")
  );
}

async function cancelAppointment(env, chatId, reason) {
  const data = session(chatId);
  const items = await readAppointments(env);

  const item = items.find(
    (entry) =>
      entry.id === data.cancelAppointmentId &&
      entry.chatId === chatId &&
      entry.status === "active"
  );

  if (!item) {
    resetSession(chatId);

    await send(chatId, "Не получилось найти активную запись для отмены.", {
      reply_markup: mainMenu()
    });

    return;
  }

  item.status = "cancelled";
  item.cancelledAt = new Date().toISOString();
  item.cancellationReason = reason.trim();

  await writeAppointments(env, items);
  resetSession(chatId);

  await send(chatId, `Запись отменена.\n\nПричина: ${item.cancellationReason}`, {
    reply_markup: mainMenu()
  });
}

async function message(env, update) {
  const chatId = update.chat.id;
  const text = update.text?.trim();
  const data = session(chatId);

  if (text === "/start" || /^start$/i.test(text ?? "")) {
    await home(chatId);
    return;
  }

  if (text === "/my" || /^моя запись$/i.test(text ?? "")) {
    await showMine(env, chatId);
    return;
  }

  if (update.contact) {
    await receiveContact(env, chatId, update.contact);
    return;
  }

  if (data.step === "name" && text) {
    await receiveName(chatId, text);
    return;
  }

  if (data.step === "cancel_reason" && text) {
    await cancelAppointment(env, chatId, text);
    return;
  }

  await send(chatId, "Нажмите /start, чтобы открыть меню.\nМожно также написать: Моя запись");
}

async function callback(env, query) {
  const chatId = query.message.chat.id;
  const data = query.data;

  await answer(query.id);

  if (data === "home") return home(chatId);
  if (data === "examples") return examples(chatId);
  if (data === "prices") return prices(chatId);
  if (data === "book") return book(chatId);
  if (data === "my_appointments") return showMine(env, chatId);

  if (data === "dates") {
    return send(chatId, "Выберите свободную дату:", {
      reply_markup: dateMenu()
    });
  }

  if (data.startsWith("service:")) {
    return chooseService(chatId, data.split(":")[1]);
  }

  if (data.startsWith("date:")) {
    return chooseDate(chatId, data.split(":")[1]);
  }

  if (data.startsWith("time:")) {
    return chooseTime(chatId, data.split(":")[1]);
  }

  if (data.startsWith("cancel:")) {
    return askCancelReason(env, chatId, data.split(":")[1]);
  }
}

async function handleUpdate(env, update) {
  if (update.message) {
    await message(env, update.message);
  }

  if (update.callback_query) {
    await callback(env, update.callback_query);
  }
}

export default {
  async fetch(request, env) {
    token = env.TELEGRAM_BOT_TOKEN;
    apiBase = `https://api.telegram.org/bot${token}`;

    if (!token) {
      return new Response("TELEGRAM_BOT_TOKEN is missing", { status: 500 });
    }

    if (request.method === "GET") {
      return new Response("Beauty demo bot webhook is running.");
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    try {
      const update = await request.json();
      await handleUpdate(env, update);

      return new Response("ok");
    } catch (error) {
      console.error(error);

      return new Response("error", { status: 500 });
    }
  }
};
