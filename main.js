(() => {
  "use strict";

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  $("#year").textContent = new Date().getFullYear();

  /* ---------- Шапка: фон при прокрутке, прячется при скролле вниз ---------- */
  const header = $("#header");
  const stickyCta = $("#sticky-cta");
  const booking = $("#booking");
  let lastY = window.scrollY;

  function onScroll() {
    const y = window.scrollY;
    header.classList.toggle("is-scrolled", y > 40);
    const menuOpen = header.classList.contains("menu-open");
    header.classList.toggle("is-hidden", !menuOpen && y > lastY && y > 600);
    lastY = y;

    // Кнопка «Записаться» внизу экрана на телефоне — после первого экрана и не над формой
    const b = booking.getBoundingClientRect();
    const overForm = b.top < window.innerHeight && b.bottom > 0;
    stickyCta.classList.toggle("is-visible", y > window.innerHeight * 0.8 && !overForm);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Мобильное меню ---------- */
  const burger = $("#burger");
  const nav = $("#nav");
  function setMenu(open) {
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
    nav.classList.toggle("is-open", open);
    header.classList.toggle("menu-open", open);
    document.body.style.overflow = open ? "hidden" : "";
  }
  burger.addEventListener("click", () => setMenu(burger.getAttribute("aria-expanded") !== "true"));
  $$("a", nav).forEach((a) => a.addEventListener("click", () => setMenu(false)));
  document.addEventListener("keydown", (e) => e.key === "Escape" && setMenu(false));

  /* ---------- Появление блоков при прокрутке ---------- */
  const revealEls = $$(".reveal");
  // Небольшая задержка у соседних элементов — эффект «волны»
  revealEls.forEach((el) => {
    const siblings = [...el.parentElement.children].filter((c) => c.classList.contains("reveal"));
    const i = siblings.indexOf(el);
    if (siblings.length > 1) el.style.setProperty("--delay", `${Math.min(i, 5) * 0.08}s`);
  });
  if ("IntersectionObserver" in window && !reducedMotion) {
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("is-visible"));
  }

  /* ---------- Счётчики на первом экране ---------- */
  const fmt = new Intl.NumberFormat("ru-RU");
  function animateCount(el) {
    const target = Number(el.dataset.count);
    const suffix = el.dataset.suffix || "";
    if (reducedMotion) {
      el.textContent = fmt.format(target) + suffix;
      return;
    }
    const start = performance.now();
    const dur = 1800;
    const tick = (now) => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 4);
      el.textContent = fmt.format(Math.round(target * eased)) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  setTimeout(() => $$("[data-count]").forEach(animateCount), 900);

  /* ---------- Цены по классу автомобиля ---------- */
  const rows = $$("#price-rows li");
  const tabs = $$(".tabs button");
  const pill = $(".tabs__pill");
  function showPrices(cls, animate) {
    rows.forEach((li) => {
      const b = $("b", li);
      const price = Number(li.dataset.prices.split(",")[cls]);
      const text = `от ${fmt.format(price)} ₽`;
      if (!animate) {
        b.textContent = text;
        return;
      }
      b.classList.add("is-switching");
      setTimeout(() => {
        b.textContent = text;
        b.classList.remove("is-switching");
      }, 220);
    });
    tabs.forEach((t) => t.setAttribute("aria-selected", String(Number(t.dataset.class) === cls)));
    movePill();
  }
  // Подсветка повторяет размер и положение выбранной кнопки (кнопки разной ширины)
  function movePill() {
    const active = tabs.find((t) => t.getAttribute("aria-selected") === "true");
    if (!active) return;
    pill.style.width = `${active.offsetWidth}px`;
    pill.style.transform = `translateX(${active.offsetLeft - 4}px)`;
  }
  tabs.forEach((t) => t.addEventListener("click", () => showPrices(Number(t.dataset.class), true)));
  window.addEventListener("resize", movePill);
  document.fonts?.ready.then(movePill);
  showPrices(0, false);

  /* ---------- Кнопки «Выбрать» в пакетах подставляют услугу в форму ---------- */
  const serviceSelect = $("#service-select");
  $$("[data-service]").forEach((btn) =>
    btn.addEventListener("click", () => {
      serviceSelect.value = btn.dataset.service;
    }),
  );

  /* ---------- Форма записи → WenLeadAI ---------- */
  const form = $("#booking-form");
  const submit = $("#form-submit");
  const errorBox = $("#form-error");
  const startedAt = Date.now(); // для проверки «заполнено слишком быстро»

  function clearErrors() {
    errorBox.textContent = "";
    $$(".has-error", form).forEach((el) => el.classList.remove("has-error"));
    $$(".field__error", form).forEach((el) => el.parentNode.removeChild(el));
  }
  function fieldError(name, message) {
    const input = form.elements[name];
    if (!input) return;
    const wrap = input.closest(".field, .consent");
    if (!wrap) return;
    wrap.classList.add("has-error");
    if (wrap.classList.contains("field")) {
      const s = document.createElement("span");
      s.className = "field__error";
      s.textContent = message;
      wrap.appendChild(s);
    }
  }
  function validate(data) {
    const errors = {};
    if (data.name.trim().length < 2) errors.name = "Укажите имя";
    if (data.phone.replace(/\D/g, "").length < 10) errors.phone = "Укажите телефон";
    if (!data.consent) errors.consent = "Нужно согласие на обработку данных";
    return errors;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();
    const fd = new FormData(form);
    const data = {
      name: String(fd.get("name") || ""),
      phone: String(fd.get("phone") || ""),
      car: String(fd.get("car") || "").trim(),
      service: String(fd.get("service") || ""),
      consent: fd.get("consent") === "on",
      website: String(fd.get("website") || ""),
    };

    const errors = validate(data);
    if (Object.keys(errors).length) {
      Object.entries(errors).forEach(([k, v]) => fieldError(k, v));
      if (errors.consent) errorBox.textContent = errors.consent;
      return;
    }

    submit.disabled = true;
    submit.textContent = "Отправляем…";
    try {
      const cfg = window.WENLEAD || {};
      const utm = Object.fromEntries(
        [...new URLSearchParams(location.search)].filter(([k]) => k.startsWith("utm_")),
      );
      const res = await fetch(`${cfg.apiUrl}/api/v1/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formKey: cfg.formKey,
          name: data.name,
          phone: data.phone,
          service: data.service || undefined,
          message: data.car ? `Автомобиль: ${data.car}` : undefined,
          consent: data.consent,
          website: data.website,
          startedAt,
          utm: Object.keys(utm).length ? utm : undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));

      if (res.ok) {
        $("#form-success-text").textContent = body.number
          ? `Номер заявки — №${body.number}. Перезвоним в течение 15 минут.`
          : "Перезвоним в течение 15 минут.";
        $("#form-success").hidden = false;
        form.reset();
        return;
      }
      if (res.status === 400 && body.errors) {
        Object.entries(body.errors).forEach(([k, v]) => fieldError(k, v));
        if (body.errors.consent) errorBox.textContent = body.errors.consent;
      } else if (res.status === 429) {
        errorBox.textContent = "Слишком много попыток. Подождите минуту.";
      } else {
        errorBox.textContent = "Не удалось отправить заявку. Позвоните нам: +7 473 000-00-00.";
      }
    } catch {
      errorBox.textContent = "Нет связи с сервером записи. Позвоните нам: +7 473 000-00-00.";
    } finally {
      submit.disabled = false;
      submit.textContent = "Записаться на осмотр";
    }
  });
})();
