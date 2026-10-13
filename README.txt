MAKTAB CRM (Node.js backend + frontend)

TALAB: Node.js 16 yoki yangiroq (https://nodejs.org). Qo'shimcha kutubxona o'rnatish shart emas.

ISHGA TUSHIRISH
  1) Papkada terminal oching
  2) node index.js        (yoki: npm start)
  3) Brauzerda oching: http://localhost:3000

SUPER ADMIN: login "admin", parol "admin123"
Ishga tushirishdan oldin parolni o'zgartiring:
  Windows (PowerShell):  $env:ADMIN_PASSWORD="yangi_parol"; node index.js
  Linux / Mac:           ADMIN_PASSWORD=yangi_parol node index.js

SOZLAMALAR (muhit o'zgaruvchilari)
  PORT=3000            port
  ADMIN_LOGIN=admin    super admin logini
  ADMIN_PASSWORD=...   super admin paroli
  DATA_DIR=./data      ma'lumotlar papkasi

FAYLLAR
  index.js             backend (server + API)
  public/index.html    frontend (sayt)
  data/db.json         ma'lumotlar bazasi (birinchi ishga tushishda o'zi yaratiladi)

ZAXIRA: data/db.json faylini vaqti-vaqti bilan nusxalab qo'ying, hamma ma'lumot shu yerda.

ROLLAR
  Super admin: ustozlar, o'quvchilar (login/parol bilan), guruhlar, darsliklar,
               qarzlar daftari, to'lovlar, davomat hisoboti (faqat ko'rish)
  Ustoz:       o'z guruhlari, davomat belgilash, uyga vazifa berish va tekshirish
  O'quvchi:    uyga vazifa, o'z davomati, darsliklar
Ruxsatlar serverda tekshiriladi: ustoz boshqa ustozning ma'lumotini, o'quvchi esa
qarz/to'lov yoki boshqa o'quvchilarni ko'ra olmaydi.

INTERNETDA ISHLATISH
  - HTTPS kerak (Nginx/Caddy orqali yoki hosting o'zi beradi).
  - Ustoz va o'quvchi parollari db.json da oddiy matn ko'rinishida saqlanadi
    (super admin ularni jadvalda ko'ra olishi uchun). Faylga begonalar kira olmasin.
  - Login urinishlari cheklangan (1 daqiqada 10 ta noto'g'ri urinish).
