# Browser Doctor — Chrome Web Store Resubmission Checklist

## 1) Violation context
- Violation ID: `Red Potassium`
- Reason: metadata does not match real product functionality.
- Risk keyword from rejection: `media`

## 2) Safe metadata text (RU)
- Name: `Browser Doctor — диагностика нагрузки Chrome`
- Short description:
  `Диагностика нагрузки Chrome: тяжёлые вкладки, рекомендации и безопасная оптимизация в side panel.`
- Full description:
  `Browser Doctor анализирует вкладки и нагрузку браузера, показывает тяжёлые вкладки, формирует рекомендации и помогает безопасно закрывать выбранные вкладки для освобождения ресурсов. Расширение также показывает сводку по активным расширениям, ведёт локальную историю (сегодня/7 дней) и отправляет локальные уведомления при высокой нагрузке. На каналах Chrome, где недоступны точные process-метрики, используются безопасные оценочные модели и это явно отображается в интерфейсе.`

## 3) Single purpose (copy for CWS)
`Browser Doctor has one clear purpose: browser performance diagnostics and user-initiated cleanup of heavy tabs to reduce resource load in Chrome.`

## 4) Permission justifications (copy for CWS)
- `tabs`:
  `Needed to read open tab metadata (title/url/state) and close user-selected heavy tabs during optimization.`
- `storage`:
  `Needed to store local diagnostics history and notification cooldown state.`
- `management`:
  `Needed to list enabled extensions (name/version) for diagnostics visibility in the popup.`
- `notifications`:
  `Needed to show local warnings when browser load is high.`
- `sidePanel`:
  `Needed to render Browser Doctor UI in Chrome Side Panel.`

## 5) Remote code declaration
- Select: `No, I do not use remote code`.
- Reason:
  `All JavaScript/CSS assets are packaged in the extension. No external script tags, no eval/new Function, no remotely executed code.`

## 6) Data disclosure recommendations
Mark:
- `User activity` (diagnostic counters and optimization actions)
- `Website content` (tab title/URL data used for diagnostics)

Do NOT mark:
- Health, financial, authentication, location, web search history, adult content (if not used).

## 7) Screenshot rules
- Use only real Browser Doctor UI.
- Show: health badge, heavy tabs list, recommendations, extension list, daily/7-day stats.
- Do not show claims about video/audio/media editing/downloading.

## 8) Final checks before submit
1. Uploaded ZIP version equals `manifest.json` version.
2. CWS text matches real features only.
3. Privacy policy URL is public and matches current behavior.
4. Test instructions are concrete and reproducible.

## Policy links
- https://developer.chrome.com/docs/webstore/program-policies/policies
- https://developer.chrome.com/docs/webstore/program-policies/deceptive-installation-tactics-faq
