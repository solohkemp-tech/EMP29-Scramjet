# منابع رسمی امکانات EMP29 Pro

بررسی: 2026-10-11. این منابع برای انتخاب قابلیت‌ها استفاده شدند. اجرای فضاها، نمای دوگانه و کنترل سایت، کد مستقل EMP29 است؛ کتابخانه Readability با مجوز خودش استفاده شده است.

| منبع اصلی | قابلیت انتخاب‌شده | پیاده‌سازی و محدوده EMP29 |
| --- | --- | --- |
| [Vivaldi Workspaces](https://help.vivaldi.com/desktop/tabs/workspaces/) | سازمان‌دهی تب‌ها، خواب گروهی و کپی پیوندها | ۸ فضای کاری با نام/رنگ، انتقال تب و ۱۲ نشست؛ کوکی بین فضاها مشترک است. |
| [Vivaldi Tab Tiling](https://help.vivaldi.com/desktop/tabs/tab-tiling/) | نمایش هم‌زمان چند صفحه | دو تب یک فضا؛ در موبایل چیدمان عمودی، بدون جابه‌جایی شبکه دلخواه یا چهار پنل. |
| [Mozilla Readability](https://github.com/mozilla/readability) | استخراج متن خواندنی مقاله | نسخه 0.6.0 با دریافت هنگام استفاده، متن ساده، یادداشت و ذخیره محدود. |
| [Brave site-specific Shields](https://support.brave.com/hc/en-us/articles/360023646212-How-do-I-configure-global-and-site-specific-Shields-settings) | کنترل محافظت در سطح سایت | قوانین دامنه و استثنا برای رفع شکست صفحه؛ بدون ادعای هم‌ارزی با ضدتبلیغ یا ضداثر انگشت Brave. |
| [Scramjet source](https://github.com/MercuryWorkshop/scramjet) و [CurlTransport](https://github.com/MercuryWorkshop/CurlTransport) | چرخه آماده‌سازی بازنویس و انتقال | core/controller/utils از سورس سازگار، انتظار WASM، انتخاب اتصال و عیب‌یابی محدود به داده ضروری. |
| [Wisp server](https://github.com/MercuryWorkshop/wisp-js) | پیام آغاز اتصال و سیاست مقصد | بررسی handshake واقعی، مسیر جایگزین پیش از مرور، حفاظت Origin و DNS عمومی در سرور داخلی. |

فضای کاری در یک پراکسی وب، مرورگر نصب‌شده مستقل یا پروفایل حساب جدا نیست. موفقیت handshake فقط دسترسی و پروتکل مسیر را تأیید می‌کند؛ TLS مقصد، سرعت ویدئو و سازگاری سایت با بررسی روی همان سرور مشخص می‌شوند. هیچ کد افزونه، مرورگر یا فهرست تبلیغاتی بزرگ بدون مجوز وارد نشده است.

## دوزبانه‌سازی و اصلاح هسته در 2.1

- [MDN: dir](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/dir): استفاده از `lang`/`dir` برای زبان رابط و `dir=auto` برای متن‌هایی که کاربر یا سایت تعیین می‌کند.
- [MDN: Intl](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl): قالب‌بندی تاریخ و شمارنده‌ها با `fa-IR` و `en-US`.
- منطق کامپایل و دریافت باینری در سورس Scramjet بررسی شد؛ اصلاح JavaScript به صورت یک fork قابل رهگیری ثبت شده و باینری Rust معتبر قبلی حفظ شده است. مقایسه مستقیم با بسته EMP29 2.0 در `emp29/core-benchmark.json` آمده است.
