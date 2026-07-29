DEPLOY — /superadmin/msg image + UI fix

1) BACKEND (steelblue nodejs/)
   - Upload controllerV2/welcomeWhatsapp.js
   - Upload middleware/whatsappMSG/welcomeMessage.js
   - Upload/touch tmp/restart.txt
   Optional on server .env:
   BACKEND_PUBLIC_URL=https://steelblue-goshawk-113691.hostingersite.com

2) FRONTEND (peachpuff)
   - Rebuild from .builds/last-source (Msg.js changed) and deploy public_html
   OR copy Msg.js into your source tree, npm run build, deploy build output

After deploy: select image on /superadmin/msg — URL should be
https://steelblue-goshawk-113691.hostingersite.com/uploads/photos/...
Success toast: "Image saved" (no localhost warning on live)
