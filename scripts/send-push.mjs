/**
 * إرسال Web Push من السيرفر — مثال
 *
 * 1) npm install web-push
 * 2) npx web-push generate-vapid-keys
 * 3) ضع المفاتيح في متغيرات البيئة:
 *    VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (mailto:you@example.com)
 * 4) node scripts/send-push.mjs push-subscriptions.json "عنوان" "نص الرسالة"
 */
import fs from 'node:fs';
import webpush from 'web-push';

const [,, subsFile, title, body] = process.argv;
if (!subsFile || !title || !body) {
  console.error('Usage: node scripts/send-push.mjs <subscriptions.json> <title> <body>');
  process.exit(1);
}

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || 'mailto:admin@ronaq.local';

if (!publicKey || !privateKey) {
  console.error('Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY');
  process.exit(1);
}

webpush.setVapidDetails(subject, publicKey, privateKey);

const data = JSON.parse(fs.readFileSync(subsFile, 'utf8'));
const list = Array.isArray(data.subscriptions) ? data.subscriptions : data;

const payload = JSON.stringify({ title, body, url: './index.html' });

for (const sub of list) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      payload
    );
    console.log('Sent:', sub.endpoint.slice(0, 48) + '…');
  } catch (err) {
    console.error('Failed:', sub.endpoint.slice(0, 48), err.statusCode || err.message);
  }
}
