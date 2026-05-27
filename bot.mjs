import fs from "node:fs/promises";
import path from "node:path";

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error("Set TELEGRAM_BOT_TOKEN before running the bot.");
  console.error('PowerShell example: $env:TELEGRAM_BOT_TOKEN="123456:ABC"; node bot.mjs');
  process.exit(1);
}

const apiBase = `https://api.telegram.org/bot${token}`;
const appointmentsPath = path.resolve("appointments.json");
const sessions = new Map();

const services = [
  { id: "manicure", title: "Маникюр", duration: "1 ч 30 мин", price: "от 1 500 ₽" },
  { id: "pedicure", title: "Педикюр", duration: "1 ч 40 мин", price: "от 1 800 ₽" },
  { id: "brows", title: "Брови / ресницы", duration: "1 ч", price: "от 1 200 ₽" },
  { id: "hair", title: "Окрашивание", duration: "2 ч 30 мин", price: "от 3 500 ₽" }
];

const workExamples = [
  ["Маникюр: чистое покрытие, укрепление, дизайн", "https://images.unsplash.com/photo-1604654894610-df63bc536371"],
  ["Брови: оформление, окрашивание, ламинирование", "https://images.unsplash.com/photo-1516975080664-ed2fc6a32937"],
  ["Волосы: окрашивание, уход, укладка", "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e"]
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

function appointmentDate(appointment) {
  const [year, month, day] = appointment.date.split("-").map(Number);
  const [hour, minute] = appointment.time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0);
}

function session(chatId) {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, {});
  }

  return sessions.get(chatId);
}

function resetSession(chatId) {
  sessions.set(chatId, {});
  return sessions.get(chatId);
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
  return tg("answerCallbackQuery", { callback_query_id: id });
}

async function readAppointments() {
  try {
    return JSON.parse(await fs.readFile(appointmentsPath, "utf8"));
  } catch {
    return [];
  }
}

async function writeAppointments(items) {
  await fs.writeFile(appointmentsPath, `${JSON.stringify(items, null, 2)}\n`, "utf8");
}

async function activeAppointments(chatId) {
  const items = await readAppointments();
  return items.filter((item) => item.chatId === chatId && item.status === "active");
}

function appointmentText(item) {
  return [
    `Услуга: <b>${item.service}</b>`,
    `Дата и время: <b>${formatDate(item.date)}, ${item.time}</b>`,
    `Имя: <b>${item.name}</b>`,
    `Телефон: <b>${item.phone}</b>`
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
      "Кнопка <b>Моя запись</b> показывает активную запись и позволяет отменить ее с указанием причины."
    ].join("\n"),
    { reply_markup: mainMenu() }
  );
}

async function examples(chatId) {
  await send(
    chatId,
    [
      "<b>Примеры работ</b>",
      "",
      ...workExamples.map(([title, link], index) => `${index + 1}. <a href="${link}">${title}</a>`),
      "",
      "В реальном боте сюда ставятся фото салона и работ мастеров."
    ].join("\n"),
    { reply_markup: inline([[{ text: "Хочу записаться", callback_data: "book" }], [{ text: "Назад", callback_data: "home" }]]) }
  );
}

async function prices(chatId) {
  await send(
    chatId,
    ["<b>Демо-услуги</b>", "", ...services.map((item) => `${item.title}: ${item.price}`)].join("\n"),
    { reply_markup: inline([[{ text: "Записаться", callback_data: "book" }], [{ text: "Назад", callback_data: "home" }]]) }
  );
}

async function showMine(chatId) {
  resetSession(chatId);
  const items = await activeAppointments(chatId);

  if (items.length === 0) {
    await send(chatId, "У вас пока нет активной записи.", {
      reply_markup: inline([[{ text: "Записаться", callback_data: "book" }], [{ text: "Назад", callback_data: "home" }]])
    });
    return;
  }

  await send(
    chatId,
    ["<b>Ваша активная запись</b>", "", ...items.map((item, index) => `${index + 1}. ${appointmentText(item)}`)].join("\n\n"),
    {
      reply_markup: inline([
        ...items.map((item) => [{ text: `Отменить: ${formatDate(item.date)}, ${item.time}`, callback_data: `cancel:${item.id}` }]),
        [{ text: "Назад", callback_data: "home" }]
      ])
    }
  );
}

async function book(chatId) {
  const data = resetSession(chatId);
  data.step = "service";
  await send(chatId, "Выберите услугу:", { reply_markup: serviceMenu() });
}

async function chooseService(chatId, serviceId) {
  const data = session(chatId);
  data.step = "date";
  data.serviceId = serviceId;
  await send(chatId, `Выбрали: <b>${selectedService(data).title}</b>.\nТеперь выберите свободную дату:`, { reply_markup: dateMenu() });
}

async function chooseDate(chatId, date) {
  const data = session(chatId);
  data.step = "time";
  data.date = date;
  await send(chatId, `Дата: <b>${formatDate(date)}</b>.\nВыберите свободное время:`, { reply_markup: timeMenu() });
}

async function chooseTime(chatId, time) {
  const data = session(chatId);
  data.step = "name";
  data.time = time;
  await send(
    chatId,
    [
      "Почти готово.",
      "",
      `Услуга: <b>${selectedService(data).title}</b>`,
      `Дата: <b>${formatDate(data.date)}</b>`,
      `Время: <b>${time}</b>`,
      "",
      "Как к вам обращаться?"
    ].join("\n")
  );
}

async function receiveName(chatId, name) {
  const data = session(chatId);
  data.step = "phone";
  data.name = name.trim();
  await send(chatId, `${data.name}, оставьте номер телефона для подтверждения записи.`, { reply_markup: contactKeyboard() });
}

async function receiveContact(chatId, contact) {
  const data = session(chatId);
  const service = selectedService(data);

  if (!service || !data.date || !data.time || !data.name) {
    await send(chatId, "Давайте начнем запись заново.", { reply_markup: removeKeyboard() });
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
    reminder24hSent: false,
    createdAt: new Date().toISOString()
  };

  const items = await readAppointments();
  items.push(item);
  await writeAppointments(items);
  resetSession(chatId);

  await send(
    chatId,
    ["Запись принята!", "", appointmentText(item), "", "За сутки до визита бот отправит напоминание."].join("\n"),
    { reply_markup: removeKeyboard() }
  );
  await send(chatId, "Теперь запись можно посмотреть или отменить через кнопку <b>Моя запись</b>.", { reply_markup: mainMenu() });
}

async function askCancelReason(chatId, id) {
  const items = await activeAppointments(chatId);
  const item = items.find((entry) => entry.id === id);

  if (!item) {
    await send(chatId, "Эта запись уже не активна или не найдена.", { reply_markup: mainMenu() });
    return;
  }

  const data = resetSession(chatId);
  data.step = "cancel_reason";
  data.cancelAppointmentId = id;

  await send(chatId, ["Хорошо, отменим запись.", "", appointmentText(item), "", "Напишите причину отмены:"].join("\n"));
}

async function cancel(chatId, reason) {
  const data = session(chatId);
  const items = await readAppointments();
  const item = items.find((entry) => entry.id === data.cancelAppointmentId && entry.chatId === chatId && entry.status === "active");

  if (!item) {
    resetSession(chatId);
    await send(chatId, "Не получилось найти активную запись для отмены.", { reply_markup: mainMenu() });
    return;
  }

  item.status = "cancelled";
  item.cancelledAt = new Date().toISOString();
  item.cancellationReason = reason.trim();
  await writeAppointments(items);
  resetSession(chatId);

  await send(chatId, `Запись отменена.\n\nПричина: <b>${item.cancellationReason}</b>`, { reply_markup: mainMenu() });
}

async function message(update) {
  const chatId = update.chat.id;
  const text = update.text?.trim();
  const data = session(chatId);

  if (text === "/start" || /^start$/i.test(text ?? "")) {
    await home(chatId);
    return;
  }

  if (text === "/my" || /^моя запись$/i.test(text ?? "")) {
    await showMine(chatId);
    return;
  }

  if (update.contact) {
    await receiveContact(chatId, update.contact);
    return;
  }

  if (data.step === "name" && text) {
    await receiveName(chatId, text);
    return;
  }

  if (data.step === "cancel_reason" && text) {
    await cancel(chatId, text);
    return;
  }

  await send(chatId, "Нажмите /start, чтобы открыть меню. Можно также написать: Моя запись");
}

async function callback(query) {
  const chatId = query.message.chat.id;
  const data = query.data;
  await answer(query.id);

  if (data === "home") return home(chatId);
  if (data === "examples") return examples(chatId);
  if (data === "prices") return prices(chatId);
  if (data === "book") return book(chatId);
  if (data === "my_appointments") return showMine(chatId);
  if (data === "dates") return send(chatId, "Выберите свободную дату:", { reply_markup: dateMenu() });
  if (data.startsWith("service:")) return chooseService(chatId, data.split(":")[1]);
  if (data.startsWith("date:")) return chooseDate(chatId, data.split(":")[1]);
  if (data.startsWith("time:")) return chooseTime(chatId, data.split(":")[1]);
  if (data.startsWith("cancel:")) return askCancelReason(chatId, data.split(":")[1]);
}

async function sendDueReminders() {
  const items = await readAppointments();
  const now = new Date();
  let changed = false;

  for (const item of items) {
    if (item.status !== "active" || item.reminder24hSent) continue;

    const msLeft = appointmentDate(item).getTime() - now.getTime();
    if (msLeft > 0 && msLeft <= 24 * 60 * 60 * 1000) {
      await send(
        item.chatId,
        ["Напоминаем о вашей записи завтра:", "", appointmentText(item), "", "Если планы изменились, откройте «Моя запись» и отмените визит."].join("\n"),
        { reply_markup: mainMenu() }
      );
      item.reminder24hSent = true;
      item.reminder24hSentAt = new Date().toISOString();
      changed = true;
    }
  }

  if (changed) await writeAppointments(items);
}

function startReminderLoop() {
  setTimeout(() => sendDueReminders().catch((error) => console.error("Reminder error:", error.message)), 10_000);
  setInterval(() => sendDueReminders().catch((error) => console.error("Reminder error:", error.message)), 60_000);
}

async function poll() {
  let offset = 0;
  console.log("Beauty demo bot is running. Press Ctrl+C to stop.");

  while (true) {
    try {
      const response = await fetch(`${apiBase}/getUpdates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ offset, timeout: 30, allowed_updates: ["message", "callback_query"] })
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.description);

      for (const update of data.result) {
        offset = update.update_id + 1;
        if (update.message) await message(update.message);
        if (update.callback_query) await callback(update.callback_query);
      }
    } catch (error) {
      console.error("Polling error:", error.message);
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
  }
}

startReminderLoop();
poll();
