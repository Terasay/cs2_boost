export type Language = "ru" | "en";
export const languages: Language[] = ["ru", "en"];
export const serviceSlugs = ["premier-boost", "faceit-boost", "calibration"] as const;
export type ServiceSlug = typeof serviceSlugs[number];
export type Faq = { question: string; answer: string };
export type ServiceContent = {
  title: string; description: string; heading: string; intro: string; label: string;
  platform: "premier" | "faceit"; service: "rating" | "calibration";
  overview: string; details: string[]; quote: string; preparation: string[]; faq: Faq[];
};

export function isLanguage(value: string): value is Language { return value === "ru" || value === "en"; }
export function isServiceSlug(value: string): value is ServiceSlug { return serviceSlugs.some(slug => slug === value); }

export const services: Record<Language, Record<ServiceSlug, ServiceContent>> = {
  ru: {
    "premier-boost": {
      title: "Буст Premier CS2 — рейтинг, способы и оформление заказа",
      description: "Буст рейтинга Premier в CS2: игра вместе или выполнение на аккаунте. Согласуйте целевой рейтинг, стоимость и срок с администратором до оплаты.",
      heading: "Буст рейтинга Premier в CS2", label: "PREMIER", platform: "premier", service: "rating",
      intro: "Укажите текущий и желаемый рейтинг Premier. Обсудите формат игры с администратором и подтвердите предложение перед началом выполнения.",
      overview: "Заказ на буст Premier оформляется под конкретную цель по рейтингу. В заявке сохраняются начальное и желаемое значения, способ выполнения и согласованные условия. Если рейтинг ещё не определён, выберите калибровку: её условия обсуждаются отдельно.",
      details: ["Текущий и целевой рейтинг в заявке", "Выбор совместной игры или выполнения на аккаунте", "Цена и дата завершения в предложении администратора", "Статус выполнения и переписка в личном кабинете"],
      quote: "Стоимость рассчитывается после проверки параметров заявки. При обсуждении укажите регион игры и удобное время. Если выбираете совместную игру, заранее согласуйте расписание. Срок начала и дата завершения подтверждаются администратором; отправка заявки сама по себе не означает, что выполнение уже началось.",
      preparation: ["Проверьте актуальный рейтинг Premier в игре.", "Укажите желаемый результат и выберите способ выполнения.", "Сообщите в чате регион и удобное время для матчей.", "Дождитесь предложения и проверьте цену и дату завершения."],
      faq: [
        { question: "Можно ли заказать Premier без передачи аккаунта?", answer: "Да. Выберите «Игра вместе»: вы играете со своего аккаунта вместе с исполнителем. Возможность выполнения и расписание согласуйте в чате заказа." },
        { question: "Что выбрать, если рейтинг ещё не определён?", answer: "Выберите услугу «Калибровка». Администратор уточнит состояние аккаунта и условия выполнения, прежде чем предложить цену и срок." },
        { question: "Когда оплачивать заказ?", answer: "Сначала администратор присылает предложение с ценой и датой завершения. Вы подтверждаете его в кабинете, затем согласуете оплату. Отправка заявки не требует платежа." },
      ],
    },
    "faceit-boost": {
      title: "Буст FACEIT CS2 — повышение рейтинга и игра вместе",
      description: "Заявка на буст FACEIT в CS2. Укажите текущий и целевой рейтинг, выберите способ выполнения и получите предложение с ценой и сроком до оплаты.",
      heading: "Буст FACEIT в CS2", label: "FACEIT", platform: "faceit", service: "rating",
      intro: "Согласуйте повышение рейтинга FACEIT под вашу цель. Выберите игру вместе или выполнение на аккаунте и обсудите детали до подтверждения заказа.",
      overview: "В форме заказа FACEIT укажите рейтинг, который отображается в вашем профиле, и желаемое значение. Конкретную цель, особенности аккаунта и доступное время можно дополнить в чате. Все договорённости по цене и дате завершения фиксируются в предложении администратора.",
      details: ["Параметры FACEIT отдельно от рейтинга Premier", "Совместная игра с согласованным расписанием", "Обсуждение аккаунта и цели до подтверждения", "Чат заказа и отдельный канал поддержки"],
      quote: "Единую цену для всех аккаунтов мы не указываем: администратор рассматривает текущий рейтинг, цель и выбранный способ выполнения. Регион и расписание уточняются в переписке. Проверьте предложение до подтверждения; если нужно изменить цель, сначала обсудите новые условия.",
      preparation: ["Уточните текущий рейтинг в профиле FACEIT.", "Запишите желаемое значение рейтинга.", "Выберите удобный способ выполнения и сообщите регион.", "Для совместной игры согласуйте дни и время матчей."],
      faq: [
        { question: "Какой рейтинг указывать в форме?", answer: "Укажите числовой рейтинг FACEIT из своего профиля. Если вы ориентируетесь на определённый уровень, напишите об этом администратору, чтобы согласовать конкретную цель." },
        { question: "Можно ли обсудить цель до оплаты?", answer: "Да. После создания заявки доступен чат с администратором. Цена и дата завершения появляются в отдельном предложении, которое нужно подтвердить." },
        { question: "Гарантирует ли заказ отсутствие ограничений FACEIT?", answer: "Нет. Буст может нарушать правила площадки и привести к ограничениям аккаунта. При оформлении требуется подтвердить понимание этих рисков; согласование заказа не отменяет правила FACEIT." },
      ],
    },
    calibration: {
      title: "Калибровка CS2 — заявка для Premier и FACEIT",
      description: "Оформление заявки на калибровку CS2 для Premier или FACEIT. Условия для вашего аккаунта, способ выполнения, цена и срок согласуются до оплаты.",
      heading: "Калибровка аккаунта CS2", label: "CALIBRATION", platform: "premier", service: "calibration",
      intro: "Если рейтинг ещё не определён, начните с заявки на калибровку. Выберите площадку, а объём работы и ожидаемый результат обсудите с администратором.",
      overview: "Для заявки на калибровку не требуется вводить текущий и целевой рейтинг. Условия зависят от состояния аккаунта и выбранной площадки. Администратор уточнит, какие действия нужны в вашем случае, и согласует объём работы до начала выполнения.",
      details: ["Выбор Premier или FACEIT в форме заявки", "Уточнение состояния аккаунта в чате", "Согласование объёма работы и ожидаемого результата", "Цена и дата завершения до оплаты"],
      quote: "Результат калибровки не рассчитывается формой автоматически. Сообщите администратору выбранную площадку, что уже пройдено на аккаунте и какой формат игры вам подходит. Конкретный объём, стоимость и срок появятся после обсуждения. Если рейтинг уже определён и нужно его повысить, выберите буст рейтинга.",
      preparation: ["Выберите площадку, на которой нужен результат.", "Укажите «Калибровка» и подходящий способ выполнения.", "Расскажите администратору о текущем состоянии аккаунта.", "Согласуйте объём работы и ожидаемый результат до подтверждения."],
      faq: [
        { question: "Нужно ли указывать желаемый рейтинг?", answer: "В форме калибровки числовые поля не требуются. Ожидания по результату обсудите в чате: форма не обещает определённое значение после калибровки." },
        { question: "Одинаковы ли условия для Premier и FACEIT?", answer: "Нет. Выберите нужную площадку, и администратор уточнит условия именно для вашего аккаунта. Общий объём матчей для всех аккаунтов заранее не устанавливается." },
        { question: "Можно ли проходить калибровку вместе с исполнителем?", answer: "В заявке можно выбрать «Игра вместе». Доступность этого способа для вашего аккаунта и расписание необходимо согласовать до начала работы." },
      ],
    },
  },
  en: {
    "premier-boost": {
      title: "CS2 Premier Boost — Rating Goals, Methods and Orders",
      description: "Request a CS2 Premier rating boost. Play together or choose a piloted order, then agree on your target, price and completion date before payment.",
      heading: "CS2 Premier rating boost", label: "PREMIER", platform: "premier", service: "rating",
      intro: "Enter your current and target Premier rating. Discuss the playing method with an admin and review the offer before work begins.",
      overview: "A Premier boost request starts with a specific rating goal. Your order keeps the starting and target values, playing method and agreed terms together. If your rating has not been established yet, choose calibration and discuss its conditions separately.",
      details: ["Current and target ratings saved with your request", "Play together or choose a piloted order", "Price and completion date in the admin's offer", "Order status and conversation in your account"],
      quote: "An admin calculates the price after reviewing your request. Include your playing region and available times in the conversation. For a duo order, agree on a schedule before starting. The admin confirms availability and the completion date; submitting a request does not mean work has already started.",
      preparation: ["Check your current Premier rating in the game.", "Choose a target rating and playing method.", "Share your region and available times in the order chat.", "Review the price and completion date before accepting."],
      faq: [
        { question: "Can I order without handing over my account?", answer: "Yes. Choose “Play together” to play on your own account alongside the booster. Confirm availability and scheduling in the order chat." },
        { question: "What if I do not have a rating yet?", answer: "Choose “Calibration”. An admin will check the account's current state and agree on the scope before offering a price and deadline." },
        { question: "When do I pay?", answer: "First, the admin sends a price and completion date. Accept the offer in your account, then agree on payment. Submitting a request does not require a payment." },
      ],
    },
    "faceit-boost": {
      title: "CS2 FACEIT Boost — Rating Requests and Duo Play",
      description: "Configure a CS2 FACEIT boost with your current and target rating. Choose your playing method and review an admin's price and deadline before payment.",
      heading: "CS2 FACEIT boost", label: "FACEIT", platform: "faceit", service: "rating",
      intro: "Plan a FACEIT rating boost around your goal. Choose duo or piloted play and discuss the details before confirming your order.",
      overview: "Enter the rating shown on your FACEIT profile and the value you want to reach. Use the order chat to explain your goal, account details and availability. The admin records the agreed price and completion date in an offer for you to review.",
      details: ["FACEIT settings separate from Premier ratings", "Duo play with an agreed schedule", "Account and target review before confirmation", "An order chat and a separate support conversation"],
      quote: "There is no single price for every account. An admin reviews your current rating, target and playing method, then discusses region and scheduling with you. Check the offer before accepting it. If your goal changes, discuss the updated terms first.",
      preparation: ["Check the current rating on your FACEIT profile.", "Choose the numerical rating you want to reach.", "Select a playing method and share your region.", "For duo play, agree on the days and times for matches."],
      faq: [
        { question: "Which rating should I enter?", answer: "Enter the numerical FACEIT rating shown on your profile. If your goal is a particular level, tell the admin so you can agree on a specific target." },
        { question: "Can I discuss the target before paying?", answer: "Yes. Once you submit a request, you can message an admin. The price and completion date appear in a separate offer that requires your confirmation." },
        { question: "Does an order guarantee no FACEIT restrictions?", answer: "No. Boosting may violate platform rules and lead to account restrictions. You must acknowledge these risks when ordering; accepting an offer does not override FACEIT rules." },
      ],
    },
    calibration: {
      title: "CS2 Calibration — Premier and FACEIT Requests",
      description: "Request CS2 calibration for Premier or FACEIT. Discuss your account, playing method, scope, price and completion date before paying.",
      heading: "CS2 account calibration", label: "CALIBRATION", platform: "premier", service: "calibration",
      intro: "If your rating has not been established, start with a calibration request. Choose a platform, then agree on the scope and expected outcome with an admin.",
      overview: "Calibration requests do not require current and target rating values. The terms depend on the account's current state and the selected platform. An admin checks what is needed in your case and confirms the scope before work starts.",
      details: ["Premier or FACEIT selection in the request form", "Account details discussed in the order chat", "An agreed scope and expected outcome", "Price and completion date before payment"],
      quote: "The form does not predict a calibration result. Tell the admin which platform you use, what has already been completed and which playing method you prefer. The scope, price and deadline are agreed after this discussion. If you already have a rating and want to increase it, choose a rating boost instead.",
      preparation: ["Choose the platform where you need calibration.", "Select “Calibration” and your preferred playing method.", "Explain the account's current state to the admin.", "Agree on the scope and expected outcome before confirming."],
      faq: [
        { question: "Do I need to enter a target rating?", answer: "The calibration form does not require rating values. Discuss your expectations in the chat: the form does not promise a particular final rating." },
        { question: "Are Premier and FACEIT conditions the same?", answer: "No. Select the platform and an admin will review your account's requirements. We do not assume a fixed number of matches for every account." },
        { question: "Can I play calibration matches with the booster?", answer: "You can select “Play together” in your request. Confirm whether this method is available for your account and agree on a schedule before work begins." },
      ],
    },
  },
};

export const commonCopy = {
  ru: {
    services: "Услуги", process: "Как это работает", faq: "Вопросы", home: "Главная", login: "Войти", account: "Кабинет", more: "Подробнее", request: "Настроить заявку", other: "Другие услуги", included: "Что будет в заказе", pricing: "Стоимость и срок", prepare: "Перед оформлением", methods: "Выберите способ выполнения", duo: "Игра вместе", duoText: "Вы играете на своём аккаунте вместе с исполнителем. Согласуйте регион и расписание, чтобы подобрать время для совместных матчей.", piloted: "На вашем аккаунте", pilotedText: "Исполнитель играет на аккаунте по согласованным условиям. Порядок доступа обсудите с администратором. Пароль Steam и коды Steam Guard нельзя отправлять в форму заявки или чат сайта.",
    steps: [ { title: "Настройте заявку", text: "Выберите площадку, цель и способ выполнения. Создайте аккаунт, чтобы сохранить заказ." }, { title: "Обсудите детали", text: "Уточните регион, расписание и ожидания в чате с администратором." }, { title: "Подтвердите предложение", text: "Проверьте цену и дату завершения. После подтверждения согласуйте оплату." }, { title: "Следите за заказом", text: "Читайте обновления статуса и пишите в чат. Для других вопросов есть отдельная поддержка." } ],
    questions: [ { question: "Как следить за выполнением?", answer: "В личном кабинете доступны статус и чат каждого заказа. Статус обновляет администратор; автоматическое отслеживание матчей в игре не используется." }, { question: "Что делать, если нужно изменить условия?", answer: "Напишите администратору в чате заказа. Изменённые цену и срок нужно согласовать заново. Если предложение обновилось, проверьте его перед подтверждением." }, { question: "Куда обратиться с вопросом не по заказу?", answer: "После входа откройте раздел «Поддержка». Это отдельная переписка с администратором, доступная независимо от чата заказа." } ],
    finalTitle: "Обсудим вашу цель", finalText: "Укажите параметры заявки. Администратор уточнит детали и предложит цену и дату завершения до оплаты.", footer: "Буст рейтинга и калибровка CS2", independence: "Независимый сервис. Не связан с Valve, Steam или FACEIT.", support: "Поддержка", safety: "Буст может нарушать правила площадок и привести к ограничениям аккаунта. Учитывайте это при выборе услуги.",
  },
  en: {
    services: "Services", process: "How it works", faq: "FAQ", home: "Home", login: "Sign in", account: "Account", more: "View service", request: "Configure request", other: "Explore other services", included: "Your order includes", pricing: "Price and completion date", prepare: "Before you order", methods: "Choose your playing method", duo: "Play together", duoText: "Play on your own account alongside the booster. Agree on your region and schedule to find suitable times for matches.", piloted: "Piloted play", pilotedText: "The booster plays on your account under agreed conditions. Discuss access arrangements with an admin. Do not send Steam passwords or Steam Guard codes in the request form or website chat.",
    steps: [ { title: "Configure your request", text: "Choose a platform, goal and playing method. Create an account to save the order." }, { title: "Discuss the details", text: "Share your region, schedule and expectations in the admin chat." }, { title: "Review the offer", text: "Check the price and completion date. Accept the offer, then agree on payment." }, { title: "Follow your order", text: "Check status updates and use the order chat. Separate support is available for other questions." } ],
    questions: [ { question: "How do I follow progress?", answer: "Your account shows a status and chat for each order. The admin updates statuses; the website does not automatically track in-game matches." }, { question: "What if the terms need to change?", answer: "Message the admin in the order chat. Changes to the price and deadline need a new agreement. If an offer has been updated, review it before accepting." }, { question: "Where can I ask about something outside my order?", answer: "After signing in, open “Support”. It is a separate conversation with an admin, independent of the order chat." } ],
    finalTitle: "Tell us your goal", finalText: "Configure a request. An admin will review the details and offer a price and completion date before payment.", footer: "CS2 rating boosts and calibration", independence: "Independent service. Not affiliated with Valve, Steam or FACEIT.", support: "Support", safety: "Boosting may violate platform rules and lead to account restrictions. Consider this when choosing a service.",
  },
};
