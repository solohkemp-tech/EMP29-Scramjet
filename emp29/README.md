# EMP29

برنامه آماده اجرا در این پوشه است. راهنمای کامل فارسی، نصب سرور و توضیح قابلیت‌ها در [README اصلی](../README.md) قرار دارد.

```sh
npm ci --omit=dev --ignore-scripts
npm start
```

سپس http://localhost:3030 را باز کن. Node.js 24 LTS توصیه می‌شود. برای رمز و نصب با دامنه HTTPS، پیش از اجرا `npm run setup` را اجرا کن.

توسعه: `npm ci`، سپس `npm run build`، `npm test` و `npm run check`. همه این دستورها داخل همین پوشه اجرا می‌شوند.
